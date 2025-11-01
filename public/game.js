const socket = io();

// Get room info from session storage
const roomCode = sessionStorage.getItem('roomCode');
const isHost = sessionStorage.getItem('isHost') === 'true';

// DOM elements
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const playersList = document.getElementById('playersList');
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
const answerTimer = document.getElementById('answerTimer');
const voteTimer = document.getElementById('voteTimer');
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
    window.location.href = '/';
}

roomCodeDisplay.textContent = roomCode;

// Show/hide host controls
if (isHost) {
    hostControls.classList.remove('hidden');
    waitingMessage.classList.add('hidden');
    hostControlsEnd.classList.remove('hidden');
} else {
    hostControls.classList.add('hidden');
    waitingMessage.classList.remove('hidden');
    hostControlsEnd.classList.add('hidden');
}

// Request room state after connection
socket.on('connect', () => {
    socket.emit('request-room-state', { roomCode });
});

// Timers
let answerInterval = null;
let voteInterval = null;

function startAnswerTimer(timeLeft) {
    answerTimer.textContent = timeLeft;
    answerInterval = setInterval(() => {
        timeLeft--;
        answerTimer.textContent = Math.max(0, timeLeft);
        if (timeLeft <= 0) {
            clearInterval(answerInterval);
        }
    }, 1000);
}

function startVoteTimer(timeLeft) {
    voteTimer.textContent = timeLeft;
    voteInterval = setInterval(() => {
        timeLeft--;
        voteTimer.textContent = Math.max(0, timeLeft);
        if (timeLeft <= 0) {
            clearInterval(voteInterval);
        }
    }, 1000);
}

function clearAllTimers() {
    if (answerInterval) clearInterval(answerInterval);
    if (voteInterval) clearInterval(voteInterval);
}

// Socket events
socket.on('room-state', (data) => {
    updatePlayersList(data.players);
    // Update isHost if needed
    if (data.isHost !== isHost) {
        sessionStorage.setItem('isHost', data.isHost ? 'true' : 'false');
        window.location.reload();
    }
});

socket.on('player-joined', (data) => {
    updatePlayersList(data.players);
});

socket.on('player-left', (data) => {
    updatePlayersList(data.players);
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
    
    // Update UI
    currentQuestion.textContent = data.question;
    roundNumber.textContent = data.roundNumber;
    startAnswerTimer(20);
    
    // Focus input
    answerInput.focus();
});

socket.on('answers-shown', (data) => {
    clearAllTimers();
    
    // Hide answering, show voting
    answeringState.classList.add('hidden');
    votingState.classList.remove('hidden');
    
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
    
    startVoteTimer(30);
});

socket.on('results-shown', (data) => {
    clearAllTimers();
    
    // Hide voting, show results
    votingState.classList.add('hidden');
    resultsState.classList.remove('hidden');
    
    // Display answers with labels
    resultsAnswersGrid.innerHTML = '';
    data.answers.forEach((answer, index) => {
        const answerCard = document.createElement('div');
        answerCard.className = 'answer-card revealed';
        
        if (index === data.aiAnswerIndex) {
            answerCard.classList.add('ai');
            answerCard.innerHTML = `
                <div class="answer-text">${answer}</div>
                <div class="answer-label">🤖 AI Answer</div>
            `;
        } else {
            answerCard.classList.add('player');
            answerCard.innerHTML = `
                <div class="answer-text">${answer}</div>
                <div class="answer-label">👤 Player Answer</div>
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

socket.on('error', (data) => {
    showError(data.message);
});

// UI Functions
function updatePlayersList(players) {
    playersList.innerHTML = '';
    players.forEach(player => {
        const li = document.createElement('li');
        li.textContent = player.name;
        playersList.appendChild(li);
    });
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
