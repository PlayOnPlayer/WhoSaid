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
  GAME_STATES,
  rooms
} = require('./game-manager');

const { initializeAI, generateAIAnswer } = require('./ai-service');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Initialize AI service
initializeAI();

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Timers removed - using auto-advance when all players answer/vote

/**
 * Handle end of answer phase
 */
async function handleAnswerPhaseEnd(roomCode) {
  const room = getRoom(roomCode);
  if (!room || room.state !== GAME_STATES.ANSWERING) return;
  
  // Check if no one answered
  if (room.playerAnswers.size === 0) {
    console.log('[SERVER] No answers submitted, skipping to next round');
    
    // Show message and advance to next round
    io.to(roomCode).emit('no-answers', {
      message: 'Everyone was too slow! Let\'s try another one.'
    });
    
    // Wait a moment, then start next round
    setTimeout(() => {
      const updatedRoom = getRoom(roomCode);
      if (updatedRoom && updatedRoom.state === GAME_STATES.ANSWERING) {
        startRound(roomCode);
        const nextRoom = getRoom(roomCode);
        
        io.to(roomCode).emit('round-started', {
          question: nextRoom.currentQuestion,
          playerName: nextRoom.currentQuestionPlayer.name,
          roundNumber: nextRoom.roundNumber
        });
      }
    }, 3000);
    
    return;
  }
  
  // Generate AI answer
  const playerAnswers = Array.from(room.playerAnswers.values());
  
  try {
    const aiAnswer = await generateAIAnswer(room.currentQuestion, playerAnswers);
    
    // Prepare answers for voting
    prepareAnswersForVoting(roomCode, aiAnswer);
    
    // Find AI answer index in shuffled answers
    const aiAnswerIndex = room.shuffledAnswers.findIndex(a => a.isAI === true);
    
    // Extract answer texts for display
    const answerTexts = room.shuffledAnswers.map(a => a.text);
    
    // Notify all players in room
    io.to(roomCode).emit('answers-shown', {
      answers: answerTexts,
      aiAnswerIndex: aiAnswerIndex,
      showAiIndex: false
    });
    
    // No timer - voting will auto-advance when all vote
    
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
  
  // Extract answer texts and authors for display
  const answerData = room.shuffledAnswers.map(a => ({
    text: a.text,
    author: a.author,
    isAI: a.isAI
  }));
  
  // Notify all players
  io.to(roomCode).emit('results-shown', {
    results: result.results,
    aiAnswerIndex: result.aiAnswerIndex,
    answers: answerData
  });
  
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
  console.log('[SERVER] ==========================================');
  console.log('[SERVER] NEW CONNECTION:', socket.id);
  console.log('[SERVER] Total active rooms:', rooms.size);
  
  // Store room code for this socket
  let currentRoomCode = null;
  
  // Create room
  socket.on('create-room', (data) => {
    console.log('[SERVER] ==========================================');
    console.log('[SERVER] CREATE-ROOM EVENT RECEIVED');
    console.log('[SERVER] Socket ID:', socket.id);
    console.log('[SERVER] Data received:', JSON.stringify(data));
    
    try {
      const { hostName } = data;
      console.log('[SERVER] Host name:', hostName);
      
      if (!hostName) {
        console.error('[SERVER] ERROR: Host name required');
        socket.emit('error', { message: 'Host name required' });
        return;
      }
      
      console.log('[SERVER] Calling createRoom...');
      const room = createRoom(socket.id);
      console.log('[SERVER] Room created with code:', room.code);
      
      console.log('[SERVER] Adding host to room...');
      addPlayerToRoom(room.code, socket.id, hostName);
      socket.join(room.code);
      currentRoomCode = room.code;
      
      console.log('[SERVER] Room joined. Total players:', room.players.length);
      console.log('[SERVER] Emitting room-created event...');
      
      const connectedPlayers = room.players.filter(p => p.connected !== false);
      socket.emit('room-created', {
        roomCode: room.code,
        players: connectedPlayers,
        isHost: true,
        hostId: room.hostId
      });
      
      console.log('[SERVER] room-created event emitted successfully!');
      console.log('[SERVER] ==========================================');
    } catch (error) {
      console.error('[SERVER] ERROR creating room:', error);
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
      const connectedPlayers = room.players.filter(p => p.connected !== false);
      socket.emit('room-joined', {
        roomCode,
        players: connectedPlayers,
        isHost: room.hostId === socket.id,
        hostId: room.hostId
      });
      
      // Notify all players in room
      io.to(roomCode).emit('player-joined', {
        players: connectedPlayers,
        hostId: room.hostId
      });
      
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });
  
  // Request room state (for players reconnecting or loading game page)
  socket.on('request-room-state', (data) => {
    console.log('[SERVER] ==========================================');
    console.log('[SERVER] REQUEST-ROOM-STATE EVENT RECEIVED');
    console.log('[SERVER] Socket ID:', socket.id);
    console.log('[SERVER] Data received:', JSON.stringify(data));
    
    try {
      const { roomCode, playerName } = data;
      console.log('[SERVER] Looking for room:', roomCode);
      console.log('[SERVER] Active room codes:', Array.from(rooms.keys()));
      
      const room = getRoom(roomCode);
      
      if (!room) {
        console.error('[SERVER] ERROR: Room not found:', roomCode);
        console.log('[SERVER] Available rooms:', Array.from(rooms.keys()));
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      
      console.log('[SERVER] Room found! Current players:', room.players.length);
      
      // Add player back to room if they're not already there
      if (playerName) {
        console.log('[SERVER] Adding player back to room:', playerName);
        try {
          addPlayerToRoom(roomCode, socket.id, playerName);
          console.log('[SERVER] Player added successfully');
        } catch (error) {
          console.log('[SERVER] Player already in room or error:', error.message);
        }
      }
      
      socket.join(roomCode);
      currentRoomCode = roomCode;
      
      const updatedRoom = getRoom(roomCode);
      const connectedPlayers = updatedRoom.players.filter(p => p.connected !== false);
      console.log('[SERVER] After adding player, total players:', connectedPlayers.length);
      
      console.log('[SERVER] Sending room-state to client...');
      
      // Send current room state (only connected players)
      socket.emit('room-state', {
        roomCode,
        players: connectedPlayers,
        isHost: updatedRoom.hostId === socket.id,
        hostId: updatedRoom.hostId,
        gameState: updatedRoom.state
      });
      
      // Also notify all other players in room about the updated player list
      // (in case they don't have the latest list)
      io.to(roomCode).emit('player-joined', {
        players: connectedPlayers,
        hostId: updatedRoom.hostId
      });
      
      console.log('[SERVER] room-state event emitted successfully!');
      console.log('[SERVER] ==========================================');
      
    } catch (error) {
      console.error('[SERVER] ERROR in request-room-state:', error);
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
    
    // Count only connected players
    const connectedPlayers = room.players.filter(p => p.connected !== false);
    if (connectedPlayers.length < 2) {
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
    
    // Check if all players have answered - auto-advance
    if (allPlayersAnswered(currentRoomCode)) {
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
    
    // Check if all players have voted - auto-advance
    if (allPlayersVoted(currentRoomCode)) {
      handleVotingPhaseEnd(currentRoomCode);
    }
  });
  
  // Skip to answers (host only)
  socket.on('skip-to-answers', () => {
    if (!currentRoomCode) return;
    
    const room = getRoom(currentRoomCode);
    if (!room || room.state !== GAME_STATES.ANSWERING) return;
    
    // Only host can skip
    if (room.hostId !== socket.id) {
      socket.emit('error', { message: 'Only host can skip to answers' });
      return;
    }
    
    // Force advance to voting phase
    handleAnswerPhaseEnd(currentRoomCode);
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
        
        // Round started - no timer needed
      }, 3000);
    }
  });
  
  // Disconnect handling
  socket.on('disconnect', () => {
    console.log('[SERVER] Player disconnected:', socket.id);
    
    if (currentRoomCode) {
      const room = getRoom(currentRoomCode);
      
      if (room) {
        const wasHost = room.hostId === socket.id;
        
        console.log('[SERVER] Removing disconnected player from room:', currentRoomCode);
        removePlayer(currentRoomCode, socket.id);
        
        const roomAfter = getRoom(currentRoomCode);
        
        if (wasHost && roomAfter) {
          console.log('[SERVER] Host disconnected, but room still exists. New host:', roomAfter.hostId);
          const connectedPlayers = roomAfter.players.filter(p => p.connected !== false);
          // Notify remaining players
          io.to(currentRoomCode).emit('player-left', {
            players: connectedPlayers,
            hostId: roomAfter.hostId
          });
        } else if (!wasHost && roomAfter) {
          console.log('[SERVER] Regular player disconnected, notifying remaining players');
          const connectedPlayers = roomAfter.players.filter(p => p.connected !== false);
          // Notify remaining players
          io.to(currentRoomCode).emit('player-left', {
            players: connectedPlayers,
            hostId: roomAfter.hostId
          });
        } else {
          console.log('[SERVER] Room was deleted after player left');
        }
      } else {
        console.log('[SERVER] Room not found when trying to remove player:', currentRoomCode);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
