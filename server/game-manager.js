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
  const room = rooms.get(roomCode);
  if (!room) {
    throw new Error('Room not found');
  }
  
  if (room.players.find(p => p.id === playerId)) {
    return room; // Player already in room
  }
  
  room.players.push({
    id: playerId,
    name: playerName
  });
  
  room.scores.set(playerId, 0);
  
  return room;
}

/**
 * Remove player from room
 */
function removePlayer(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  room.players = room.players.filter(p => p.id !== playerId);
  room.scores.delete(playerId);
  room.playerAnswers.delete(playerId);
  room.votes.delete(playerId);
  
  // Delete room if empty or if host left
  if (room.players.length === 0 || room.hostId === playerId) {
    rooms.delete(roomCode);
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
  
  // Pick a random player for this round's question
  const randomPlayer = room.players[Math.floor(Math.random() * room.players.length)];
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
  
  return room.playerAnswers.size === room.players.length;
}

/**
 * Prepare answers for voting (shuffle with AI answer)
 */
function prepareAnswersForVoting(roomCode, aiAnswer) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  room.aiAnswer = aiAnswer;
  
  // Combine player answers and AI answer
  const allAnswers = [...Array.from(room.playerAnswers.values()), aiAnswer];
  
  // Shuffle the answers
  const shuffled = allAnswers.sort(() => Math.random() - 0.5);
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
  
  return room.votes.size === room.players.length;
}

/**
 * Calculate scores and return results
 */
function calculateResults(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  const aiAnswerIndex = room.shuffledAnswers.indexOf(room.aiAnswer);
  const results = [];
  
  // Process each player
  for (const player of room.players) {
    const playerAnswer = room.playerAnswers.get(player.id);
    const playerAnswerIndex = room.shuffledAnswers.indexOf(playerAnswer);
    
    let pointsEarned = 0;
    const events = [];
    
    // Check if player guessed AI correctly
    const votedIndex = room.votes.get(player.id);
    if (votedIndex === aiAnswerIndex) {
      pointsEarned += 1;
      events.push('Guessed AI correctly!');
    }
    
    // Check if someone voted for this player's answer
    for (const [voterId, votedIndex] of room.votes.entries()) {
      if (votedIndex === playerAnswerIndex && voterId !== player.id) {
        pointsEarned += 1;
        events.push(`${room.players.find(p => p.id === voterId)?.name} voted for your answer!`);
      }
    }
    
    // Update score
    room.scores.set(player.id, room.scores.get(player.id) + pointsEarned);
    
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
