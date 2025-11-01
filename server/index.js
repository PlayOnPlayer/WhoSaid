require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const {
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
  GAME_STATES
} = require('./game-manager');

const { initializeAI, generateAIAnswer } = require('./ai-service');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Initialize AI service
initializeAI();

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Store active timers
const roomTimers = new Map();

/**
 * Clear timer for a room
 */
function clearRoomTimer(roomCode) {
  if (roomTimers.has(roomCode)) {
    clearTimeout(roomTimers.get(roomCode));
    roomTimers.delete(roomCode);
  }
}

/**
 * Create answer phase timer (20 seconds)
 */
function createAnswerTimer(roomCode) {
  clearRoomTimer(roomCode);
  
  const timer = setTimeout(() => {
    handleAnswerPhaseEnd(roomCode);
  }, 20000);
  
  roomTimers.set(roomCode, timer);
}

/**
 * Create voting phase timer (30 seconds)
 */
function createVotingTimer(roomCode) {
  clearRoomTimer(roomCode);
  
  const timer = setTimeout(() => {
    handleVotingPhaseEnd(roomCode);
  }, 30000);
  
  roomTimers.set(roomCode, timer);
}

/**
 * Handle end of answer phase
 */
async function handleAnswerPhaseEnd(roomCode) {
  const room = getRoom(roomCode);
  if (!room || room.state !== GAME_STATES.ANSWERING) return;
  
  // Generate AI answer
  const playerAnswers = Array.from(room.playerAnswers.values());
  
  try {
    const aiAnswer = await generateAIAnswer(room.currentQuestion, playerAnswers);
    
    // Prepare answers for voting
    prepareAnswersForVoting(roomCode, aiAnswer);
    
    // Notify all players in room
    io.to(roomCode).emit('answers-shown', {
      answers: room.shuffledAnswers,
      aiAnswerIndex: room.shuffledAnswers.indexOf(aiAnswer),
      showAiIndex: false
    });
    
    // Start voting timer
    createVotingTimer(roomCode);
    
  } catch (error) {
    console.error('Error generating AI answer:', error);
    io.to(roomCode).emit('error', { message: 'Failed to generate AI answer' });
  }
}

/**
 * Handle end of voting phase
 */
function handleVotingPhaseEnd(roomCode) {
  const room = getRoom(roomCode);
  if (!room || room.state !== GAME_STATES.VOTING) return;
  
  // Calculate results
  const result = calculateResults(roomCode);
  
  // Notify all players
  io.to(roomCode).emit('results-shown', {
    results: result.results,
    aiAnswerIndex: result.aiAnswerIndex,
    answers: room.shuffledAnswers
  });
  
  clearRoomTimer(roomCode);
  
  // Check for winner
  if (result.hasWinner) {
    setTimeout(() => {
      setGameOver(roomCode);
      io.to(roomCode).emit('game-over', {
        winner: result.hasWinner.name,
        scores: Object.fromEntries(room.scores)
      });
    }, 5000);
  } else {
    // No winner yet, auto-advance to next round after showing results
    setTimeout(() => {
      if (room.state === GAME_STATES.RESULTS) {
        const updatedRoom = getRoom(roomCode);
        if (updatedRoom && updatedRoom.state === GAME_STATES.RESULTS) {
          startRound(roomCode);
          const nextRoom = getRoom(roomCode);
          
          io.to(roomCode).emit('round-started', {
            question: nextRoom.currentQuestion,
            playerName: nextRoom.currentQuestionPlayer.name,
            roundNumber: nextRoom.roundNumber
          });
          
          createAnswerTimer(roomCode);
        }
      }
    }, 8000);
  }
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  // Store room code for this socket
  let currentRoomCode = null;
  
  // Create room
  socket.on('create-room', (data) => {
    try {
      const { hostName } = data;
      console.log('create-room event received:', hostName);
      
      if (!hostName) {
        socket.emit('error', { message: 'Host name required' });
        return;
      }
      
      const room = createRoom(socket.id);
      addPlayerToRoom(room.code, socket.id, hostName);
      socket.join(room.code);
      currentRoomCode = room.code;
      
      console.log('Room created:', room.code, 'Players:', room.players.length);
      
      socket.emit('room-created', {
        roomCode: room.code,
        players: room.players,
        isHost: true
      });
    } catch (error) {
      console.error('Error creating room:', error);
      socket.emit('error', { message: error.message });
    }
  });
  
  // Join room
  socket.on('join-room', (data) => {
    try {
      const { roomCode, playerName } = data;
      
      if (!roomCode || !playerName) {
        socket.emit('error', { message: 'Room code and player name required' });
        return;
      }
      
      const room = getRoom(roomCode);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      
      if (room.state !== GAME_STATES.LOBBY) {
        socket.emit('error', { message: 'Game already in progress' });
        return;
      }
      
      addPlayerToRoom(roomCode, socket.id, playerName);
      socket.join(roomCode);
      currentRoomCode = roomCode;
      
      // Notify the new player
      socket.emit('room-joined', {
        roomCode,
        players: room.players,
        isHost: room.hostId === socket.id
      });
      
      // Notify all players in room
      io.to(roomCode).emit('player-joined', {
        players: room.players
      });
      
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });
  
  // Request room state (for players reconnecting or loading game page)
  socket.on('request-room-state', (data) => {
    try {
      const { roomCode } = data;
      console.log('request-room-state for:', roomCode);
      const room = getRoom(roomCode);
      
      if (!room) {
        console.log('Room not found:', roomCode);
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      
      socket.join(roomCode);
      currentRoomCode = roomCode;
      
      console.log('Room found, sending state. Players:', room.players.length);
      
      // Send current room state
      socket.emit('room-state', {
        roomCode,
        players: room.players,
        isHost: room.hostId === socket.id,
        gameState: room.state
      });
      
    } catch (error) {
      console.error('Error in request-room-state:', error);
      socket.emit('error', { message: error.message });
    }
  });
  
  // Start game
  socket.on('start-game', () => {
    if (!currentRoomCode) return;
    
    const room = getRoom(currentRoomCode);
    if (!room || room.hostId !== socket.id) {
      socket.emit('error', { message: 'Only host can start game' });
      return;
    }
    
    if (room.players.length < 2) {
      socket.emit('error', { message: 'Need at least 2 players' });
      return;
    }
    
    // Start first round
    startRound(currentRoomCode);
    const updatedRoom = getRoom(currentRoomCode);
    
    // Notify all players
    io.to(currentRoomCode).emit('round-started', {
      question: updatedRoom.currentQuestion,
      playerName: updatedRoom.currentQuestionPlayer.name,
      roundNumber: updatedRoom.roundNumber
    });
    
    // Start answer timer
    createAnswerTimer(currentRoomCode);
  });
  
  // Submit answer
  socket.on('submit-answer', (data) => {
    if (!currentRoomCode) return;
    
    const room = getRoom(currentRoomCode);
    if (!room || room.state !== GAME_STATES.ANSWERING) return;
    
    submitAnswer(currentRoomCode, socket.id, data.answer);
    
    // Check if all players have answered
    if (allPlayersAnswered(currentRoomCode)) {
      clearRoomTimer(currentRoomCode);
      
      // Generate AI answer immediately
      handleAnswerPhaseEnd(currentRoomCode);
    }
  });
  
  // Submit vote
  socket.on('submit-vote', (data) => {
    if (!currentRoomCode) return;
    
    const room = getRoom(currentRoomCode);
    if (!room || room.state !== GAME_STATES.VOTING) return;
    
    submitVote(currentRoomCode, socket.id, data.answerIndex);
    
    // Check if all players have voted
    if (allPlayersVoted(currentRoomCode)) {
      clearRoomTimer(currentRoomCode);
      handleVotingPhaseEnd(currentRoomCode);
    }
  });
  
  // Play again (only when game over, triggered by host)
  socket.on('play-again', () => {
    if (!currentRoomCode) return;
    
    const room = getRoom(currentRoomCode);
    if (!room) return;
    
    // Only allow if game is over and user is host
    if (room.state === GAME_STATES.GAME_OVER && room.hostId === socket.id) {
      // Reset all scores
      for (const player of room.players) {
        room.scores.set(player.id, 0);
      }
      
      io.to(currentRoomCode).emit('new-game-started', {
        message: 'New game starting...'
      });
      
      // Wait a moment, then start first round
      setTimeout(() => {
        startRound(currentRoomCode);
        const updatedRoom = getRoom(currentRoomCode);
        
        io.to(currentRoomCode).emit('round-started', {
          question: updatedRoom.currentQuestion,
          playerName: updatedRoom.currentQuestionPlayer.name,
          roundNumber: updatedRoom.roundNumber
        });
        
        createAnswerTimer(currentRoomCode);
      }, 3000);
    }
  });
  
  // Disconnect handling
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    if (currentRoomCode) {
      removePlayer(currentRoomCode, socket.id);
      
      // Notify remaining players
      const room = getRoom(currentRoomCode);
      if (room) {
        io.to(currentRoomCode).emit('player-left', {
          players: room.players
        });
      }
      
      clearRoomTimer(currentRoomCode);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
