import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── FIREBASE CONFIG (replace with yours) ──
const firebaseConfig = {
  apiKey: "AIzaSyD0eXh2Ck-YQnVKAU2HzX5zuISYxEOQABw",
  authDomain: "slipit-2a132.firebaseapp.com",
  projectId: "slipit-2a132",
  storageBucket: "slipit-2a132.firebasestorage.app",
  messagingSenderId: "609191663781",
  appId: "1:609191663781:web:f950df58103bba0522954c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ── WORDS ──
const WORDS = [
  "Stapler","Curtain","Faucet","Blanket","Ladder","Napkin","Shovel","Plunger",
  "Funnel","Wrench","Dustpan","Shutter","Suitcase","Hanger","Pitcher","Muffler",
  "Grater","Lantern","Hamper","Locket","Binder","Spatula","Trowel","Gutter",
  "Thimble","Pulley","Socket","Gasket","Rivet","Cistern","Gimbal","Ferrule",
  "Spigot","Clevis","Bushing","Bracket","Flange","Turnip","Colander","Tarpaulin",
  "Crowbar","Doorknob","Mailbox","Clipboard","Casserole","Flywheel","Inkwell",
  "Mousetrap","Periscope","Sundial","Thermos","Washtub","Yardstick","Zipper"
];

// ── STATE ──
let myName = '';
let myRole = ''; // 'host' | 'guest'
let roomCode = '';
let myWord = '';
let wordUsed = false;
let timerInterval = null;
let unsubscribe = null;
let scores = {};
let currentRound = 1;

// ── UTILS ──
function randWord() { return WORDS[Math.floor(Math.random() * WORDS.length)]; }
function genCode() { return Math.floor(1000 + Math.random() * 9000).toString(); }
function avatar(name) { return name.charAt(0).toUpperCase(); }
function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}
function showLoading(text) {
  document.getElementById('loading-text').textContent = text || 'Loading...';
  document.getElementById('loading').style.display = 'flex';
}
function hideLoading() { document.getElementById('loading').style.display = 'none'; }
function setError(id, msg) { const el = document.getElementById(id); if(el) el.textContent = msg; }

// ── SCREENS ──
window.showScreen = function(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}

// ── CREATE ROOM ──
window.createRoom = async function() {
  const name = document.getElementById('create-name').value.trim();
  if (!name) { alert('Enter your name'); return; }

  showLoading('Creating room...');
  myName = name;
  myRole = 'host';
  roomCode = genCode();
  scores = {};
  scores[name] = 0;

  const roomData = {
    players: [{ name, isHost: true }],
    phase: 'lobby',
    round: 1,
    timerDuration: 300,
    timerStart: null,
    playerWords: {},
    allVotes: {},
    readyPlayers: [],
    votedPlayers: [],
    createdAt: Date.now()
  };

  try {
    await setDoc(doc(db, 'rooms', roomCode), roomData);
    hideLoading();
    document.getElementById('lobby-code').textContent = roomCode;
    renderLobbyPlayers([{ name, isHost: true }]);
    document.getElementById('host-controls').style.display = 'flex';
    document.getElementById('guest-waiting').style.display = 'none';
    showScreen('lobby');
    listenRoom();
  } catch(e) {
    hideLoading();
    alert('Error creating room. Try again.');
    console.error(e);
  }
}

// ── JOIN ROOM ──
window.joinRoom = async function() {
  const code = document.getElementById('join-code').value.trim();
  const name = document.getElementById('join-name').value.trim();
  setError('join-error', '');

  if (!code || code.length !== 4) { setError('join-error', 'Enter a 4-digit code'); return; }
  if (!name) { setError('join-error', 'Enter your name'); return; }

  showLoading('Joining room...');

  try {
    const snap = await getDoc(doc(db, 'rooms', code));
    if (!snap.exists()) { hideLoading(); setError('join-error', 'Room not found'); return; }

    const room = snap.data();
    if (room.phase !== 'lobby') { hideLoading(); setError('join-error', 'Game already started'); return; }
    if (room.players.find(p => p.name === name)) { hideLoading(); setError('join-error', 'Name already taken'); return; }

    myName = name;
    myRole = 'guest';
    roomCode = code;
    scores[name] = 0;

    await updateDoc(doc(db, 'rooms', code), {
      players: arrayUnion({ name, isHost: false })
    });

    hideLoading();
    document.getElementById('lobby-code').textContent = roomCode;
    document.getElementById('host-controls').style.display = 'none';
    document.getElementById('guest-waiting').style.display = 'flex';
    showScreen('lobby');
    listenRoom();
  } catch(e) {
    hideLoading();
    setError('join-error', 'Error joining. Try again.');
    console.error(e);
  }
}

// ── LISTEN ROOM (realtime) ──
function listenRoom() {
  if (unsubscribe) unsubscribe();
  unsubscribe = onSnapshot(doc(db, 'rooms', roomCode), (snap) => {
    if (!snap.exists()) return;
    const room = snap.data();
    handleRoomUpdate(room);
  });
}

function handleRoomUpdate(room) {
  const screen = document.querySelector('.screen.active')?.id;

  // Update lobby players always
  if (screen === 'screen-lobby') {
    renderLobbyPlayers(room.players);
    const btn = document.getElementById('start-btn');
    if (btn) {
      btn.disabled = room.players.length < 2;
      btn.textContent = room.players.length < 2 ? 'Waiting for players...' : 'Start Game';
    }
  }

  // Phase transitions
  if (room.phase === 'word' && screen === 'screen-lobby') {
    loadWordPhase(room);
  }
  if (room.phase === 'playing' && screen === 'screen-word') {
    // Host already started timer
  }
  if (room.phase === 'playing' && screen !== 'screen-playing' && screen !== 'screen-voting' && screen !== 'screen-results') {
    // Late joiner catch-up - ignore
  }
  if (room.phase === 'voting' && screen === 'screen-playing') {
    clearInterval(timerInterval);
    goToVoting(room);
  }
  if (room.phase === 'results' && screen === 'screen-voting') {
    showResults(room);
  }
  if (room.phase === 'word' && screen === 'screen-results') {
    loadWordPhase(room);
  }
}

function renderLobbyPlayers(players) {
  const list = document.getElementById('players-list');
  list.innerHTML = players.map(p => `
    <div class="player-item">
      <div class="player-avatar">${avatar(p.name)}</div>
      <div class="player-name">${p.name}</div>
      ${p.isHost ? '<span class="player-host-badge">Host</span>' : ''}
    </div>
  `).join('');
}

// ── START GAME ──
window.startGame = async function() {
  const mins = parseInt(document.getElementById('timer-min').value) || 0;
  const secs = parseInt(document.getElementById('timer-sec').value) || 0;
  const total = mins * 60 + secs;
  if (total < 10) { setError('lobby-error', 'Set at least 10 seconds'); return; }

  showLoading('Starting game...');

  try {
    const snap = await getDoc(doc(db, 'rooms', roomCode));
    const room = snap.data();
    const words = {};
    room.players.forEach(p => { words[p.name] = randWord(); });

    await updateDoc(doc(db, 'rooms', roomCode), {
      phase: 'word',
      timerDuration: total,
      playerWords: words,
      readyPlayers: [],
      votedPlayers: [],
      allVotes: {},
      round: room.round || 1
    });

    hideLoading();
    loadWordPhase({ ...room, playerWords: words, timerDuration: total, round: room.round || 1 });
  } catch(e) {
    hideLoading();
    console.error(e);
  }
}

// ── WORD PHASE ──
function loadWordPhase(room) {
  currentRound = room.round || 1;
  myWord = room.playerWords[myName];
  wordUsed = false;

  document.getElementById('word-text').textContent = myWord;
  document.getElementById('word-cover').classList.remove('hidden');
  document.getElementById('ready-btn').style.display = 'none';
  showScreen('word');
}

window.revealWord = function() {
  document.getElementById('word-cover').classList.add('hidden');
  document.getElementById('ready-btn').style.display = 'block';
}

window.readyToPlay = async function() {
  showLoading('Getting ready...');
  try {
    await updateDoc(doc(db, 'rooms', roomCode), {
      readyPlayers: arrayUnion(myName)
    });

    // Setup playing screen
    document.getElementById('playing-word').textContent = myWord;
    document.getElementById('used-btn').className = 'used-btn';
    document.getElementById('used-btn').textContent = '✓ I slipped my word';
    document.getElementById('used-confirm').style.display = 'none';
    document.getElementById('host-end-btn').style.display = myRole === 'host' ? 'block' : 'none';
    hideLoading();
    showScreen('playing');

    if (myRole === 'host') {
      // Wait a moment then start timer
      waitAllReadyThenStart();
    } else {
      // Listen for timer start
      waitForTimerStart();
    }
  } catch(e) {
    hideLoading();
    console.error(e);
  }
}

async function waitAllReadyThenStart() {
  // Give everyone 3 seconds to hit ready, then start regardless
  await new Promise(r => setTimeout(r, 3000));
  const snap = await getDoc(doc(db, 'rooms', roomCode));
  const room = snap.data();
  const timerStart = Date.now();
  await updateDoc(doc(db, 'rooms', roomCode), {
    phase: 'playing',
    timerStart
  });
  startLocalTimer(room.timerDuration, timerStart);
}

async function waitForTimerStart() {
  // Poll until phase = playing
  const poll = setInterval(async () => {
    const snap = await getDoc(doc(db, 'rooms', roomCode));
    const room = snap.data();
    if (room.phase === 'playing') {
      clearInterval(poll);
      startLocalTimer(room.timerDuration, room.timerStart);
    }
  }, 1000);
}

function startLocalTimer(duration, timerStart) {
  clearInterval(timerInterval);
  function tick() {
    const elapsed = Math.floor((Date.now() - timerStart) / 1000);
    const left = Math.max(0, duration - elapsed);
    const display = document.getElementById('timer-display');
    if (display) {
      display.textContent = formatTime(left);
      display.className = 'timer-big' + (left <= 30 ? ' urgent' : '');
    }
    if (left <= 0) {
      clearInterval(timerInterval);
      if (myRole === 'host') triggerVoting();
    }
  }
  tick();
  timerInterval = setInterval(tick, 500);
}

async function triggerVoting() {
  try {
    const snap = await getDoc(doc(db, 'rooms', roomCode));
    if (snap.data().phase === 'playing') {
      await updateDoc(doc(db, 'rooms', roomCode), { phase: 'voting' });
    }
    const room = snap.data();
    goToVoting(room);
  } catch(e) { console.error(e); }
}

window.hostEndRound = async function() {
  clearInterval(timerInterval);
  await triggerVoting();
}

window.markUsed = function() {
  if (wordUsed) return;
  wordUsed = true;
  document.getElementById('used-btn').className = 'used-btn done';
  document.getElementById('used-btn').textContent = 'Word used ✓';
  document.getElementById('used-confirm').style.display = 'block';
}

// ── VOTING ──
async function goToVoting(room) {
  clearInterval(timerInterval);
  if (!room) {
    const snap = await getDoc(doc(db, 'rooms', roomCode));
    room = snap.data();
  }

  const others = room.players.filter(p => p.name !== myName);
  const list = document.getElementById('vote-list');
  list.innerHTML = others.map(p => `
    <div class="vote-item">
      <div class="vote-player-name">${p.name}</div>
      <input class="input vote-input" id="vote-${p.name.replace(/\s/g,'_')}" placeholder="Their word was..." maxlength="30" autocomplete="off">
    </div>
  `).join('');

  document.getElementById('vote-submit-btn').style.display = 'block';
  document.getElementById('vote-waiting').style.display = 'none';
  showScreen('voting');
}

window.submitVotes = async function() {
  showLoading('Submitting votes...');
  try {
    const snap = await getDoc(doc(db, 'rooms', roomCode));
    const room = snap.data();
    const others = room.players.filter(p => p.name !== myName);
    const myVotes = {};
    others.forEach(p => {
      const key = 'vote-' + p.name.replace(/\s/g, '_');
      const val = document.getElementById(key)?.value.trim().toLowerCase() || '';
      myVotes[p.name] = val;
    });

    // Store votes as allVotes.voterName = { targetName: guess }
    const votesUpdate = {};
    votesUpdate[`allVotes.${myName}`] = myVotes;
    await updateDoc(doc(db, 'rooms', roomCode), {
      ...votesUpdate,
      votedPlayers: arrayUnion(myName)
    });

    hideLoading();
    document.getElementById('vote-submit-btn').style.display = 'none';
    document.getElementById('vote-waiting').style.display = 'flex';

    // Poll for all votes
    waitForResults(room.players.length);
  } catch(e) {
    hideLoading();
    console.error(e);
  }
}

function waitForResults(totalPlayers) {
  const poll = setInterval(async () => {
    const snap = await getDoc(doc(db, 'rooms', roomCode));
    const room = snap.data();
    if ((room.votedPlayers || []).length >= totalPlayers) {
      clearInterval(poll);
      if (myRole === 'host') {
        await computeAndSaveResults(room);
      } else {
        // Wait for host to compute
        waitForResultsPhase();
      }
    }
  }, 1000);
}

function waitForResultsPhase() {
  const poll = setInterval(async () => {
    const snap = await getDoc(doc(db, 'rooms', roomCode));
    const room = snap.data();
    if (room.phase === 'results') {
      clearInterval(poll);
      showResults(room);
    }
  }, 1000);
}

async function computeAndSaveResults(room) {
  const words = room.playerWords;
  const allVotes = room.allVotes || {};
  const players = room.players.map(p => p.name);

  const roundScores = {};
  const details = {};
  players.forEach(p => { roundScores[p] = 0; details[p] = { word: words[p], correct: 0, total: players.length - 1, outcome: '' }; });

  players.forEach(target => {
    const correctWord = (words[target] || '').toLowerCase();
    let correctGuesses = 0;
    const wrongVotes = {};

    players.forEach(voter => {
      if (voter === target) return;
      const guess = (allVotes[voter]?.[target] || '').toLowerCase().trim();
      if (guess === correctWord) {
        correctGuesses++;
        roundScores[voter] = (roundScores[voter] || 0) + 2;
      } else if (guess !== '') {
        wrongVotes[guess] = (wrongVotes[guess] || 0) + 1;
      }
    });

    const totalVoters = players.length - 1;
    details[target].correct = correctGuesses;

    // Did this player use their word?
    const didUse = target === myName ? wordUsed : true; // Only host knows for themselves exactly

    if (correctGuesses === 0) {
      const maxWrong = totalVoters > 0 ? Math.max(...Object.values(wrongVotes), 0) : 0;
      if (totalVoters >= 2 && maxWrong >= Math.ceil(totalVoters * 0.5)) {
        roundScores[target] = (roundScores[target] || 0) + 4;
        details[target].outcome = 'confused';
      } else {
        details[target].outcome = 'unnoticed';
      }
    } else if (correctGuesses >= totalVoters) {
      roundScores[target] = (roundScores[target] || 0) - 1;
      details[target].outcome = 'obvious';
    } else {
      roundScores[target] = (roundScores[target] || 0) + 3;
      details[target].outcome = 'slipped';
    }
  });

  // Accumulate scores
  players.forEach(p => {
    scores[p] = (scores[p] || 0) + (roundScores[p] || 0);
  });

  await updateDoc(doc(db, 'rooms', roomCode), {
    phase: 'results',
    roundScores,
    totalScores: scores,
    resultDetails: details,
    round: (room.round || 1) + 1
  });

  showResults({ ...room, roundScores, totalScores: scores, resultDetails: details });
}

function showResults(room) {
  const roundScores = room.roundScores || {};
  const totalScores = room.totalScores || scores;
  const details = room.resultDetails || {};
  const players = (room.players || []).map(p => p.name);

  // Sync local scores
  players.forEach(p => { scores[p] = totalScores[p] || 0; });

  const sorted = [...players].sort((a, b) => (totalScores[b] || 0) - (totalScores[a] || 0));

  const outcomes = {
    slipped: '🎯 Slipped undetected',
    confused: '🌀 Confused the crowd (+4)',
    obvious: '👀 Too obvious (-1)',
    unnoticed: '👻 Nobody noticed',
    didnt_use: '❌ Never used (-3)'
  };

  document.getElementById('results-round').textContent = currentRound;

  const leader = sorted[0];
  document.getElementById('results-banner').textContent =
    leader + ' leads with ' + (totalScores[leader] || 0) + ' pts';

  document.getElementById('results-list').innerHTML = sorted.map((name, i) => {
    const rScore = roundScores[name] || 0;
    const tScore = totalScores[name] || 0;
    const d = details[name] || {};
    const sign = rScore >= 0 ? '+' : '';
    return `
      <div class="result-card">
        <div class="result-header">
          <div class="result-rank ${i === 0 ? 'gold' : ''}">${i + 1}</div>
          <div class="result-name">${name}</div>
          <div class="result-pts">${sign}${rScore} <span class="total">(${tScore})</span></div>
        </div>
        <div class="result-detail">
          Word: <span class="result-word">${d.word || '—'}</span><br>
          ${outcomes[d.outcome] || ''}<br>
          <span style="color:var(--muted)">${d.correct || 0}/${d.total || 0} guessed correctly</span>
        </div>
      </div>
    `;
  }).join('');

  showScreen('results');
}

// ── NEXT ROUND ──
window.nextRound = async function() {
  if (myRole !== 'host') {
    // Guest just waits
    showLoading('Waiting for host...');
    const poll = setInterval(async () => {
      const snap = await getDoc(doc(db, 'rooms', roomCode));
      const room = snap.data();
      if (room.phase === 'word') {
        clearInterval(poll);
        hideLoading();
        loadWordPhase(room);
      }
    }, 1000);
    return;
  }

  showLoading('Starting next round...');
  try {
    const snap = await getDoc(doc(db, 'rooms', roomCode));
    const room = snap.data();
    const words = {};
    room.players.forEach(p => { words[p.name] = randWord(); });

    await updateDoc(doc(db, 'rooms', roomCode), {
      phase: 'word',
      playerWords: words,
      readyPlayers: [],
      votedPlayers: [],
      allVotes: {},
      roundScores: {},
      resultDetails: {},
      timerStart: null
    });

    hideLoading();
    loadWordPhase({ ...room, playerWords: words, round: room.round });
  } catch(e) {
    hideLoading();
    console.error(e);
  }
}

// ── LEAVE ──
window.leaveGame = function() {
  if (unsubscribe) unsubscribe();
  clearInterval(timerInterval);
  myName = ''; myRole = ''; roomCode = ''; myWord = '';
  scores = {};
  showScreen('home');
}
