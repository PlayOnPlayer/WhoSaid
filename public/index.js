const socket = io();

console.log('Socket.io initialized');

socket.on('connect', () => {
  console.log('Socket connected:', socket.id);
});

socket.on('disconnect', () => {
  console.log('Socket disconnected');
});

// DOM elements
console.log('[INDEX.JS] Initializing DOM elements...');
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const playerNameInput = document.getElementById('playerNameInput');
const hostNameInput = document.getElementById('hostNameInput');
const errorMsg = document.getElementById('errorMsg');
const loadingIndicator = document.getElementById('loadingIndicator');

console.log('[INDEX.JS] DOM elements status:', {
  createBtn: !!createBtn,
  joinBtn: !!joinBtn,
  roomCodeInput: !!roomCodeInput,
  playerNameInput: !!playerNameInput,
  hostNameInput: !!hostNameInput,
  errorMsg: !!errorMsg,
  loadingIndicator: !!loadingIndicator
});

// Make room code input uppercase
roomCodeInput.addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase();
});

// Create room
createBtn.addEventListener('click', () => {
  const hostName = hostNameInput.value.trim();
  console.log('Create button clicked, hostName:', hostName, 'socket connected:', socket.connected);
  
  if (!hostName) {
    showError('Please enter your name');
    return;
  }
  
  loadingIndicator.classList.remove('hidden');
  createBtn.disabled = true;
  
  socket.emit('create-room', { hostName });
  console.log('create-room event emitted');
});

// Join room
joinBtn.addEventListener('click', () => {
  const roomCode = roomCodeInput.value.trim();
  const playerName = playerNameInput.value.trim();
  
  if (!roomCode || !playerName) {
    showError('Please enter both room code and your name');
    return;
  }
  
  if (roomCode.length !== 4) {
    showError('Room code must be 4 letters');
    return;
  }
  
  loadingIndicator.classList.remove('hidden');
  joinBtn.disabled = true;
  
  socket.emit('join-room', { roomCode, playerName });
});

// Handle room created
socket.on('room-created', (data) => {
  console.log('Room created, storing data and redirecting:', data.roomCode);
  sessionStorage.setItem('roomCode', data.roomCode);
  sessionStorage.setItem('isHost', 'true');
  sessionStorage.setItem('playerName', hostNameInput.value.trim());
  // Small delay to ensure sessionStorage is saved
  setTimeout(() => {
    window.location.href = '/game.html';
  }, 100);
});

// Handle room joined
socket.on('room-joined', (data) => {
  console.log('Room joined, storing data and redirecting:', data.roomCode);
  sessionStorage.setItem('roomCode', data.roomCode);
  sessionStorage.setItem('isHost', data.isHost ? 'true' : 'false');
  sessionStorage.setItem('playerName', playerNameInput.value.trim());
  // Small delay to ensure sessionStorage is saved
  setTimeout(() => {
    window.location.href = '/game.html';
  }, 100);
});

// Handle errors
socket.on('error', (data) => {
  console.error('[INDEX.JS] Socket error received:', data);
  loadingIndicator.classList.add('hidden');
  createBtn.disabled = false;
  joinBtn.disabled = false;
  showError(data.message);
});

socket.on('connection', () => {
  console.log('[INDEX.JS] Socket.io connection established');
});

socket.on('reconnect', () => {
  console.log('[INDEX.JS] Socket reconnected:', socket.id);
});

socket.on('reconnect_attempt', () => {
  console.log('[INDEX.JS] Attempting to reconnect...');
});

socket.on('connect_error', (error) => {
  console.error('[INDEX.JS] Connection error:', error);
});

function showError(message) {
  console.error('[INDEX.JS] Displaying error message:', message);
  errorMsg.textContent = message;
  errorMsg.style.display = 'block';
  setTimeout(() => {
    errorMsg.style.display = 'none';
  }, 5000);
}
