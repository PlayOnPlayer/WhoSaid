const socket = io();
console.log('[GAME.JS] Socket.io initialized');

socket.on('connect', () => {
    console.log('[GAME.JS] Socket connected:', socket.id);
});

socket.on('disconnect', () => {
    console.log('[GAME.JS] Socket disconnected');
});

// Get room info from session storage
console.log('[GAME.JS] Reading from sessionStorage...');
const roomCode = sessionStorage.getItem('roomCode');
const isHost = sessionStorage.getItem('isHost') === 'true';
const playerName = sessionStorage.getItem('playerName');

console.log('[GAME.JS] Session data:', { roomCode, isHost, playerName });

// DOM elements
console.log('[GAME.JS] Initializing DOM elements...');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const playersList = document.getElementById('playersList');
const playersHeader = document.getElementById('playersHeader');
const scoresList = document.getElementById('scoresList');
const lobbyState = document.getElementById('lobbyState');
const answeringState = document.getElementById('answeringState');
const votingState = document.getElementById('votingState');
const resultsState = document.getElementById('resultsState');
const gameOverState = document.getElementById('gameOverState');
const hostControls = document.getElementById('hostControls');
const waitingMessage = document.getElementById('waitingMessage');
const startGameBtn = document.getElementById('startGameBtn');
const playAgainBtn = document.getElementById('playAgainBtn');
const hostControlsEnd = document.getElementById('hostControlsEnd');
const currentQuestion = document.getElementById('currentQuestion');
const roundNumber = document.getElementById('roundNumber');
const answerInput = document.getElementById('answerInput');
const submitAnswerBtn = document.getElementById('submitAnswerBtn');
const skipToAnswersBtn = document.getElementById('skipToAnswersBtn');
const hostSkipControls = document.getElementById('hostSkipControls');
const backToHomeBtn = document.getElementById('backToHomeBtn');
const answersGrid = document.getElementById('answersGrid');
const resultsAnswersGrid = document.getElementById('resultsAnswersGrid');
const resultsSummary = document.getElementById('resultsSummary');
const votedMessage = document.getElementById('votedMessage');
const errorMsg = document.getElementById('errorMsg');
const winnerName = document.getElementById('winnerName');
const winnerMessage = document.getElementById('winnerMessage');
const finalScores = document.getElementById('finalScores');

// Initialize
if (!roomCode) {
    console.error('[GAME.JS] No roomCode found in sessionStorage, redirecting to homepage');
    window.location.href = '/';
}

console.log('[GAME.JS] Setting room code display to:', roomCode);
roomCodeDisplay.textContent = roomCode;

// Show/hide host controls
if (isHost) {
    hostControls.classList.remove('hidden');
    waitingMessage.classList.add('hidden');
    hostControlsEnd.classList.remove('hidden');
    if (backToHomeBtn) {
        backToHomeBtn.classList.remove('hidden');
    }
} else {
    hostControls.classList.add('hidden');
    waitingMessage.classList.remove('hidden');
    hostControlsEnd.classList.add('hidden');
    if (backToHomeBtn) {
        backToHomeBtn.classList.add('hidden');
    }
}

// Request room state after connection
socket.on('connect', () => {
    console.log('[GAME.JS] Socket connected, requesting room state for:', roomCode);
    socket.emit('request-room-state', { roomCode, playerName });
    console.log('[GAME.JS] request-room-state event emitted with playerName:', playerName);
});

// Timers removed - auto-advance when all players answer/vote
function clearAllTimers() {
    // No timers to clear
}

// Socket events
socket.on('room-state', (data) => {
    console.log('[GAME.JS] Room state received:', data);
    updatePlayersList(data.players, data.hostId || null);
    // Update isHost if needed
    if (data.isHost !== isHost) {
        console.log('[GAME.JS] Host status changed, reloading...');
        sessionStorage.setItem('isHost', data.isHost ? 'true' : 'false');
        window.location.reload();
    }
    // Update back to home button visibility
    if (backToHomeBtn) {
        if (data.isHost) {
            backToHomeBtn.classList.remove('hidden');
        } else {
            backToHomeBtn.classList.add('hidden');
        }
    }
});

socket.on('player-joined', (data) => {
    console.log('[GAME.JS] Player joined:', data.players.length, 'total players');
    updatePlayersList(data.players, data.hostId || null);
});

socket.on('player-left', (data) => {
    console.log('[GAME.JS] Player left:', data.players.length, 'total players');
    updatePlayersList(data.players, data.hostId || null);
});

socket.on('round-started', (data) => {
    // Hide all states
    [lobbyState, answeringState, votingState, resultsState, gameOverState].forEach(state => {
        state.classList.add('hidden');
    });
    
    // Show answering state
    answeringState.classList.remove('hidden');
    
    // Clear previous data
    clearAllTimers();
    answerInput.value = '';
    answerInput.disabled = false;
    submitAnswerBtn.disabled = false;
    votedMessage.classList.add('hidden');
    
    // Clear any error messages
    if (errorMsg) {
        errorMsg.textContent = '';
        errorMsg.classList.add('hidden');
    }
    
    // Update UI
    currentQuestion.textContent = data.question;
    roundNumber.textContent = data.roundNumber;
    
    // Show/hide skip button for host
    if (isHost && hostSkipControls) {
        hostSkipControls.classList.remove('hidden');
    } else if (hostSkipControls) {
        hostSkipControls.classList.add('hidden');
    }
    
    // Focus input
    answerInput.focus();
});

socket.on('answers-shown', (data) => {
    clearAllTimers();
    
    // Hide answering, show voting
    answeringState.classList.add('hidden');
    votingState.classList.remove('hidden');
    
    // Hide skip button
    if (hostSkipControls) {
        hostSkipControls.classList.add('hidden');
    }
    
    // Display shuffled answers
    answersGrid.innerHTML = '';
    data.answers.forEach((answer, index) => {
        const answerCard = document.createElement('div');
        answerCard.className = 'answer-card';
        answerCard.dataset.index = index;
        answerCard.innerHTML = `
            <div class="answer-text">${answer}</div>
        `;
        
        answerCard.addEventListener('click', () => {
            if (!answerCard.classList.contains('voted')) {
                // Mark as voted
                document.querySelectorAll('.answer-card').forEach(card => {
                    card.classList.remove('voted');
                });
                answerCard.classList.add('voted');
                
                // Submit vote
                socket.emit('submit-vote', { answerIndex: index });
                votedMessage.classList.remove('hidden');
                answerInput.disabled = true;
                submitAnswerBtn.disabled = true;
            }
        });
        
        answersGrid.appendChild(answerCard);
    });
    
    // No timer - auto-advances when all vote
});

socket.on('results-shown', (data) => {
    clearAllTimers();
    
    // Hide voting, show results
    votingState.classList.add('hidden');
    resultsState.classList.remove('hidden');
    
    // Display answers with author labels
    resultsAnswersGrid.innerHTML = '';
    data.answers.forEach((answerObj, index) => {
        const answerCard = document.createElement('div');
        answerCard.className = 'answer-card revealed';
        
        // Handle both old format (string) and new format (object)
        const answerText = typeof answerObj === 'string' ? answerObj : answerObj.text;
        const author = typeof answerObj === 'string' ? 'Unknown' : answerObj.author;
        const isAI = typeof answerObj === 'string' ? (index === data.aiAnswerIndex) : answerObj.isAI;
        
        if (isAI) {
            answerCard.classList.add('ai');
            answerCard.innerHTML = `
                <div class="answer-text">${answerText}</div>
                <div class="answer-label">🤖 ${author}</div>
            `;
        } else {
            answerCard.classList.add('player');
            answerCard.innerHTML = `
                <div class="answer-text">${answerText}</div>
                <div class="answer-label">👤 ${author}</div>
            `;
        }
        
        resultsAnswersGrid.appendChild(answerCard);
    });
    
    // Show results summary
    resultsSummary.innerHTML = '';
    data.results.forEach(result => {
        const resultItem = document.createElement('div');
        resultItem.className = 'result-item';
        
        let eventsHtml = '';
        if (result.events.length > 0) {
            eventsHtml = `<div class="result-events">${result.events.join(', ')}</div>`;
        }
        
        resultItem.innerHTML = `
            <div class="result-name">${result.playerName}</div>
            <div>Points earned: ${result.pointsEarned}</div>
            <div>Total score: ${result.newScore}</div>
            ${eventsHtml}
        `;
        
        resultsSummary.appendChild(resultItem);
    });
    
    updateScores(data.results);
});

socket.on('game-over', (data) => {
    clearAllTimers();
    
    // Hide all states except game over
    [lobbyState, answeringState, votingState, resultsState].forEach(state => {
        state.classList.add('hidden');
    });
    gameOverState.classList.remove('hidden');
    
    // Show winner
    winnerMessage.textContent = `${data.winner} won with 10 points!`;
    
    // Show final scores
    finalScores.innerHTML = '<h3>Final Scores:</h3>';
    Object.entries(data.scores).forEach(([playerId, score]) => {
        const scoreItem = document.createElement('div');
        scoreItem.className = 'score-item';
        scoreItem.innerHTML = `
            <span class="score-item-name">Player ${playerId.substring(0, 4)}</span>
            <span class="score-item-value">${score}</span>
        `;
        finalScores.appendChild(scoreItem);
    });
});

socket.on('new-game-started', (data) => {
    // Just wait, will receive round-started soon
    console.log(data.message);
});

socket.on('no-answers', (data) => {
    clearAllTimers();
    
    // Hide answering state, show message
    answeringState.classList.add('hidden');
    
    // Show error message with the "too slow" message
    showError(data.message);
    
    // Message will auto-clear when next round starts
    console.log('[GAME.JS] No answers received, waiting for next round...');
});

socket.on('error', (data) => {
    showError(data.message);
});

// UI Functions
function updatePlayersList(players, hostId) {
    // Update player count header
    playersHeader.textContent = `Players (${players.length}):`;
    
    // Clear and rebuild list
    playersList.innerHTML = '';
    players.forEach(player => {
        const li = document.createElement('li');
        const isHostPlayer = hostId && player.id === hostId;
        li.textContent = isHostPlayer ? `${player.name} (Host)` : player.name;
        playersList.appendChild(li);
    });
    
    // Enable/disable Start Game button based on player count
    if (isHost && startGameBtn) {
        const hasEnoughPlayers = players.length >= 2;
        startGameBtn.disabled = !hasEnoughPlayers;
        
        const hostControlsMsg = document.querySelector('#hostControls p');
        if (hostControlsMsg) {
            if (!hasEnoughPlayers && players.length === 1) {
                hostControlsMsg.textContent = 'Waiting for at least one more player to join...';
            } else if (hasEnoughPlayers) {
                hostControlsMsg.textContent = 'Share the room code above to invite friends!';
            }
        }
        
        console.log('[GAME.JS] Start Game button state:', {
            isHost,
            playerCount: players.length,
            hasEnoughPlayers,
            disabled: startGameBtn.disabled,
            visible: !hostControls.classList.contains('hidden')
        });
    }
}

function updateScores(results) {
    // Calculate new scores from results
    const scoresMap = new Map();
    results.forEach(result => {
        scoresMap.set(result.playerId, result.newScore);
    });
    
    // Update display (simple version, just show from results)
    // In production, would maintain full player list
}

// Event handlers
startGameBtn.addEventListener('click', () => {
    startGameBtn.disabled = true;
    socket.emit('start-game');
});

if (skipToAnswersBtn) {
    skipToAnswersBtn.addEventListener('click', () => {
        socket.emit('skip-to-answers');
    });
}

if (backToHomeBtn) {
    backToHomeBtn.addEventListener('click', () => {
        // Clear session storage and return to home
        sessionStorage.clear();
        window.location.href = '/';
    });
}

playAgainBtn.addEventListener('click', () => {
    playAgainBtn.disabled = true;
    socket.emit('play-again');
});

submitAnswerBtn.addEventListener('click', () => {
    const answer = answerInput.value.trim();
    if (!answer) return;
    
    answerInput.disabled = true;
    submitAnswerBtn.disabled = true;
    socket.emit('submit-answer', { answer });
});

answerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        submitAnswerBtn.click();
    }
});

// Utility
function showError(message) {
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
    setTimeout(() => {
        errorMsg.style.display = 'none';
    }, 5000);
}

function copyRoomCode() {
    navigator.clipboard.writeText(roomCode);
    alert('Room code copied!');
}
