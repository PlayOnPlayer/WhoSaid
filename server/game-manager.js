const { getRandomQuestion, replacePlayerName } = require('./questions');

// Game states
const GAME_STATES = {
  LOBBY: 'lobby',
  ANSWERING: 'answering',
  VOTING: 'voting',
  RESULTS: 'results',
  GAME_OVER: 'game_over'
};

// Store all game rooms
const rooms = new Map();

// Store room cleanup timers (for rooms that are temporarily empty)
const roomCleanupTimers = new Map();

/**
 * Generate a random 4-letter room code
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Create a new game room
 */
function createRoom(hostId) {
  const roomCode = generateRoomCode();
  console.log('createRoom called, generated code:', roomCode, 'hostId:', hostId);
  
  const room = {
    code: roomCode,
    players: [],
    hostId,
    state: GAME_STATES.LOBBY,
    currentQuestion: null,
    currentQuestionPlayer: null,
    playerAnswers: new Map(), // playerId -> answer
    aiAnswer: null,
    shuffledAnswers: [], // shuffled array with AI mixed in
    votes: new Map(), // playerId -> index of voted answer
    scores: new Map(), // playerId -> score
    roundNumber: 0
  };
  
  rooms.set(roomCode, room);
  console.log('Room stored in rooms map, total rooms:', rooms.size);
  return room;
}

/**
 * Get a room by code
 */
function getRoom(roomCode) {
  return rooms.get(roomCode);
}

/**
 * Add player to a room
 */
function addPlayerToRoom(roomCode, playerId, playerName) {
  console.log('[GAME-MANAGER] addPlayerToRoom called:', { roomCode, playerId, playerName });
  const room = rooms.get(roomCode);
  if (!room) {
    throw new Error('Room not found');
  }
  
  // Check if player already in room by socket ID (already connected)
  const existingBySocketId = room.players.find(p => p.id === playerId && p.connected !== false);
  if (existingBySocketId) {
    console.log('[GAME-MANAGER] Player already in room by socket ID');
    return room;
  }
  
  // Check if player with same name exists (reconnection scenario)
  const existingByName = room.players.find(p => p.name === playerName);
  if (existingByName) {
    console.log('[GAME-MANAGER] Player with same name exists, reconnecting...');
    // Update the existing player's socket ID (they reconnected)
    const oldId = existingByName.id;
    
    // Preserve score when reconnecting
    if (room.scores.has(oldId)) {
      room.scores.set(playerId, room.scores.get(oldId));
      room.scores.delete(oldId);
    }
    
    // If this player was the host, update hostId to their new socket ID
    if (room.hostId === oldId) {
      console.log('[GAME-MANAGER] Reconnecting player was the host, updating hostId');
      room.hostId = playerId;
    }
    
    // Update player info
    existingByName.id = playerId;
    existingByName.connected = true;
    delete existingByName.disconnectedAt;
    
    // Ensure score is initialized if missing
    if (!room.scores.has(playerId)) {
      room.scores.set(playerId, room.scores.get(oldId) || 0);
      if (oldId !== playerId && room.scores.has(oldId)) {
        room.scores.delete(oldId);
      }
    }
    
    console.log('[GAME-MANAGER] Player reconnected, updated socket ID');
    
    // Cancel any cleanup timer since a player rejoined
    cancelRoomCleanup(roomCode);
    
    return room;
  }
  
  console.log('[GAME-MANAGER] Adding new player to room');
  room.players.push({
    id: playerId,
    name: playerName,
    connected: true
  });
  
  room.scores.set(playerId, 0);
  
  // Cancel any cleanup timer since a player joined
  cancelRoomCleanup(roomCode);
  
  return room;
}

/**
 * Remove player from room
 */
function removePlayer(roomCode, playerId) {
  console.log('[GAME-MANAGER] removePlayer called:', { roomCode, playerId });
  const room = rooms.get(roomCode);
  if (!room) {
    console.log('[GAME-MANAGER] Room not found when removing player');
    return;
  }
  
  console.log('[GAME-MANAGER] Room found. Current players:', room.players.length);
  console.log('[GAME-MANAGER] Is host:', room.hostId === playerId);
  
  // Mark player as disconnected but DON'T remove from players array (for reconnection matching)
  const player = room.players.find(p => p.id === playerId);
  if (player) {
    player.connected = false;
    player.disconnectedAt = Date.now();
    console.log('[GAME-MANAGER] Marked player as disconnected, keeping in list for reconnection');
  }
  
  // Clear active game state for this player
  room.scores.delete(playerId);
  room.playerAnswers.delete(playerId);
  room.votes.delete(playerId);
  
  // Count only connected players
  const connectedPlayers = room.players.filter(p => p.connected !== false);
  console.log('[GAME-MANAGER] Connected players:', connectedPlayers.length, 'Total players in list:', room.players.length);
  
  // Don't reassign host immediately - keep original hostId in case host reconnects
  // Only reassign if no one is connected (will be handled during room cleanup if needed)
  if (connectedPlayers.length === 0) {
    console.log('[GAME-MANAGER] No connected players left, scheduling room deletion in 30 seconds for reconnection');
    scheduleRoomCleanup(roomCode);
  } else {
    console.log('[GAME-MANAGER] Connected players still in room, keeping room alive');
    cancelRoomCleanup(roomCode);
  }
}

/**
 * Schedule a room to be deleted after 30 seconds
 */
function scheduleRoomCleanup(roomCode) {
  // Cancel any existing timer
  cancelRoomCleanup(roomCode);
  
  // Schedule deletion in 30 seconds
  const timer = setTimeout(() => {
    console.log('[GAME-MANAGER] Cleanup timer expired, deleting room:', roomCode);
    rooms.delete(roomCode);
    roomCleanupTimers.delete(roomCode);
  }, 30000);
  
  roomCleanupTimers.set(roomCode, timer);
  console.log('[GAME-MANAGER] Scheduled cleanup for room:', roomCode);
}

/**
 * Cancel a scheduled room cleanup
 */
function cancelRoomCleanup(roomCode) {
  if (roomCleanupTimers.has(roomCode)) {
    clearTimeout(roomCleanupTimers.get(roomCode));
    roomCleanupTimers.delete(roomCode);
    console.log('[GAME-MANAGER] Cancelled cleanup for room:', roomCode);
  }
}

/**
 * Start a new round
 */
function startRound(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) {
    throw new Error('Room not found');
  }
  
  // Ensure all connected players have scores initialized
  const connectedPlayers = room.players.filter(p => p.connected !== false);
  for (const player of connectedPlayers) {
    if (!room.scores.has(player.id)) {
      room.scores.set(player.id, 0);
    }
  }
  
  // Pick a random connected player for this round's question
  const randomPlayer = connectedPlayers[Math.floor(Math.random() * connectedPlayers.length)];
  room.currentQuestionPlayer = randomPlayer;
  
  // Get a random question and replace XX with player name
  const questionTemplate = getRandomQuestion();
  room.currentQuestion = replacePlayerName(questionTemplate, randomPlayer.name);
  
  room.state = GAME_STATES.ANSWERING;
  room.playerAnswers.clear();
  room.votes.clear();
  room.roundNumber++;
  
  return room;
}

/**
 * Submit an answer
 */
function submitAnswer(roomCode, playerId, answer) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  room.playerAnswers.set(playerId, answer.trim());
  
  return room;
}

/**
 * Check if all players have answered
 */
function allPlayersAnswered(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return false;
  
  // Count only connected players
  const connectedPlayers = room.players.filter(p => p.connected !== false);
  return room.playerAnswers.size === connectedPlayers.length;
}

/**
 * Prepare answers for voting (shuffle with AI answer)
 */
function prepareAnswersForVoting(roomCode, aiAnswer) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  room.aiAnswer = aiAnswer;
  
  // Create answer entries with author info
  const answerEntries = [];
  
  // Add player answers with author info
  for (const [playerId, answer] of room.playerAnswers.entries()) {
    const player = room.players.find(p => p.id === playerId);
    answerEntries.push({
      text: answer,
      author: player ? player.name : 'Unknown',
      authorId: playerId,
      isAI: false
    });
  }
  
  // Add AI answer
  answerEntries.push({
    text: aiAnswer,
    author: 'AI',
    authorId: 'ai',
    isAI: true
  });
  
  // Shuffle the answers
  const shuffled = answerEntries.sort(() => Math.random() - 0.5);
  room.shuffledAnswers = shuffled;
  
  room.state = GAME_STATES.VOTING;
  
  return room;
}

/**
 * Submit a vote
 */
function submitVote(roomCode, playerId, answerIndex) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  room.votes.set(playerId, answerIndex);
  
  return room;
}

/**
 * Check if all players have voted
 */
function allPlayersVoted(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return false;
  
  // Count only connected players
  const connectedPlayers = room.players.filter(p => p.connected !== false);
  return room.votes.size === connectedPlayers.length;
}

/**
 * Calculate scores and return results
 */
function calculateResults(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  // Find AI answer index
  const aiAnswerIndex = room.shuffledAnswers.findIndex(a => a.isAI === true);
  const results = [];
  
  // Process each connected player
  const connectedPlayers = room.players.filter(p => p.connected !== false);
  for (const player of connectedPlayers) {
    // Ensure score is initialized
    if (!room.scores.has(player.id)) {
      room.scores.set(player.id, 0);
    }
    
    const playerAnswer = room.playerAnswers.get(player.id);
    // Find index of this player's answer in shuffled array
    const playerAnswerIndex = room.shuffledAnswers.findIndex(a => 
      !a.isAI && a.authorId === player.id
    );
    
    let pointsEarned = 0;
    const events = [];
    
    // Check if player guessed AI correctly
    const votedIndex = room.votes.get(player.id);
    if (votedIndex !== undefined && votedIndex === aiAnswerIndex) {
      pointsEarned += 1;
      events.push('Guessed AI correctly!');
    }
    
    // Check if someone voted for this player's answer
    if (playerAnswerIndex !== -1) {
      for (const [voterId, votedIndex] of room.votes.entries()) {
        if (votedIndex === playerAnswerIndex && voterId !== player.id) {
          const voter = room.players.find(p => p.id === voterId);
          pointsEarned += 1;
          events.push(`${voter ? voter.name : 'Someone'} voted for your answer!`);
        }
      }
    }
    
    // Update score
    const currentScore = room.scores.get(player.id) || 0;
    room.scores.set(player.id, currentScore + pointsEarned);
    
    results.push({
      playerId: player.id,
      playerName: player.name,
      pointsEarned,
      events,
      newScore: room.scores.get(player.id)
    });
  }
  
  room.state = GAME_STATES.RESULTS;
  
  return {
    results,
    aiAnswerIndex,
    hasWinner: checkForWinner(room)
  };
}

/**
 * Check if anyone has won
 */
function checkForWinner(room) {
  for (const [playerId, score] of room.scores.entries()) {
    if (score >= 10) {
      return room.players.find(p => p.id === playerId);
    }
  }
  return null;
}

/**
 * Set game to game over state
 */
function setGameOver(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  room.state = GAME_STATES.GAME_OVER;
  
  return room;
}

/**
 * Reset room to lobby
 */
function resetToLobby(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  room.state = GAME_STATES.LOBBY;
  room.currentQuestion = null;
  room.currentQuestionPlayer = null;
  room.playerAnswers.clear();
  room.aiAnswer = null;
  room.shuffledAnswers = [];
  room.votes.clear();
  room.roundNumber = 0;
  
  return room;
}

module.exports = {
  GAME_STATES,
  rooms,
  createRoom,
  getRoom,
  addPlayerToRoom,
  removePlayer,
  startRound,
  submitAnswer,
  allPlayersAnswered,
  prepareAnswersForVoting,
  submitVote,
  allPlayersVoted,
  calculateResults,
  checkForWinner,
  setGameOver,
  resetToLobby
};
