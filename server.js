const express = require('express');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// --- Real Switchagories content, ported from the single-device build. ---
// Order matters: it lines up with CATEGORY_WHEEL (and the wheel's 6 wedges)
// on the client, wedge-c1..c6 in this same sequence.
const CATEGORY_WHEEL = [
  { cat: 'Geography', icon: '🌍' },
  { cat: 'Science', icon: '🔬' },
  { cat: 'History', icon: '🏛️' },
  { cat: 'Pop Culture', icon: '📺' },
  { cat: 'Sports', icon: '🏆' },
  { cat: 'Entertainment', icon: '🎬' },
];

const MAIN_QUESTIONS = [
  { cat: 'Geography', diff: 'easy', q: 'What is the largest country in the world by land area?', choices: ['Canada', 'Russia', 'China', 'USA'], correct: 1 },
  { cat: 'Science', diff: 'easy', q: 'Which planet is known as the Red Planet?', choices: ['Venus', 'Mars', 'Jupiter', 'Saturn'], correct: 1 },
  { cat: 'History', diff: 'medium', q: 'In what year did World War II end?', choices: ['1943', '1945', '1947', '1950'], correct: 1 },
  { cat: 'Pop Culture', diff: 'easy', q: 'Which streaming service produced "Stranger Things"?', choices: ['Hulu', 'Netflix', 'Disney+', 'Amazon Prime'], correct: 1 },
  { cat: 'Sports', diff: 'medium', q: 'How many players does a soccer team have on the field at once, including the goalkeeper?', choices: ['9', '10', '11', '12'], correct: 2 },
  { cat: 'Entertainment', diff: 'medium', q: 'Who directed the movie "Jaws"?', choices: ['George Lucas', 'Steven Spielberg', 'Martin Scorsese', 'James Cameron'], correct: 1 },
  { cat: 'Geography', diff: 'medium', q: 'Which river is traditionally considered the longest in the world?', choices: ['Amazon', 'Nile', 'Yangtze', 'Mississippi'], correct: 1 },
  { cat: 'Science', diff: 'medium', q: 'What is the chemical symbol for gold?', choices: ['Ag', 'Au', 'Gd', 'Go'], correct: 1 },
  { cat: 'History', diff: 'hard', q: 'Which empire built Machu Picchu?', choices: ['Aztec', 'Maya', 'Inca', 'Olmec'], correct: 2 },
  { cat: 'Pop Culture', diff: 'hard', q: 'Which of these is the best-selling video game of all time?', choices: ['Tetris', 'Minecraft', 'Grand Theft Auto V', 'Wii Sports'], correct: 1 },
  { cat: 'Sports', diff: 'easy', q: 'In which sport would you perform a "slam dunk"?', choices: ['Volleyball', 'Basketball', 'Tennis', 'Baseball'], correct: 1 },
  { cat: 'Geography', diff: 'easy', q: 'The Sahara Desert is located on which continent?', choices: ['Asia', 'Africa', 'Australia', 'South America'], correct: 1 },
];

const QUESTION_TIME_MS = 18000; // matches the original build's MAIN_TIME (18s)

// Wheel-spin transition timing — matches the single-device build so the
// pacing feels the same. The server holds the game in the 'wheel' phase for
// this long before it reveals the actual question, so every client's spin
// animation (which runs on its own clock) lands at roughly the same time.
const WHEEL_SPIN_MS = 3300;
const WHEEL_LAND_PAUSE_MS = 100;
const WHEEL_TRANSITION_TAIL_MS = 1100;
const WHEEL_TOTAL_MS = WHEEL_SPIN_MS + WHEEL_LAND_PAUSE_MS + WHEEL_TRANSITION_TAIL_MS;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// In-memory room state.
// code -> {
//   players: Map(playerId -> { id, name, isHost, ws, score }),
//   phase: 'lobby' | 'wheel' | 'question' | 'reveal' | 'ended',
//   mainSet: [question, ...]  (this room's shuffled order, set at startGame)
//   questionIndex: number,
//   answers: Map(playerId -> choiceIndex),
//   timer: Timeout | null,
// }
const rooms = new Map();

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function genCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  } while (rooms.has(code));
  return code;
}

function genPlayerId() {
  return 'p_' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

function roomSnapshot(room) {
  return Array.from(room.players.values()).map((p) => ({
    id: p.id,
    name: p.name,
    isHost: p.isHost,
    connected: !!p.ws,
    score: p.score,
  }));
}

function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(code, obj) {
  const room = rooms.get(code);
  if (!room) return;
  const payload = JSON.stringify(obj);
  for (const p of room.players.values()) {
    if (p.ws && p.ws.readyState === p.ws.OPEN) p.ws.send(payload);
  }
}

function broadcastPlayers(code) {
  broadcast(code, { type: 'players', code, players: roomSnapshot(rooms.get(code)) });
}

function publicQuestion(room, index) {
  const q = room.mainSet[index];
  return { index, total: room.mainSet.length, cat: q.cat, q: q.q, choices: q.choices, timeMs: QUESTION_TIME_MS };
}

function answeredCount(room) {
  return room.answers.size;
}

// Wheel spin: a short, purely-decorative-but-synchronized transition that
// always lands on the real category of the upcoming question. Every client
// animates its own spin locally; the server just holds the game here for
// WHEEL_TOTAL_MS so everyone lands at roughly the same moment, then reveals
// the actual question.
function startWheel(code, index) {
  const room = rooms.get(code);
  if (!room) return;
  room.phase = 'wheel';
  room.questionIndex = index;
  const target = room.mainSet[index];
  broadcast(code, { type: 'wheel', cat: target.cat, index, total: room.mainSet.length });
  clearTimeout(room.timer);
  room.timer = setTimeout(() => startQuestion(code, index), WHEEL_TOTAL_MS);
}

function startQuestion(code, index) {
  const room = rooms.get(code);
  if (!room) return;
  room.phase = 'question';
  room.questionIndex = index;
  room.answers = new Map();
  broadcast(code, {
    type: 'question',
    ...publicQuestion(room, index),
    answeredCount: 0,
    playerCount: room.players.size,
  });
  clearTimeout(room.timer);
  room.timer = setTimeout(() => revealAnswer(code), QUESTION_TIME_MS);
}

function revealAnswer(code) {
  const room = rooms.get(code);
  if (!room || room.phase !== 'question') return;
  clearTimeout(room.timer);
  room.phase = 'reveal';

  const q = room.mainSet[room.questionIndex];
  const answerMap = {};
  for (const [playerId, choice] of room.answers.entries()) {
    answerMap[playerId] = choice;
    if (choice === q.correct) {
      const player = room.players.get(playerId);
      if (player) player.score += 1;
    }
  }

  const isLast = room.questionIndex >= room.mainSet.length - 1;
  broadcast(code, {
    type: 'reveal',
    index: room.questionIndex,
    cat: q.cat,
    correct: q.correct,
    answers: answerMap,
    players: roomSnapshot(room),
    isLast,
  });
}

wss.on('connection', (ws) => {
  let myRoomCode = null;
  let myPlayerId = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return;
    }

    if (msg.type === 'host') {
      const name = String(msg.name || 'Player').slice(0, 20) || 'Player';
      const code = genCode();
      const playerId = genPlayerId();
      const room = { players: new Map(), phase: 'lobby', mainSet: [], questionIndex: -1, answers: new Map(), timer: null };
      room.players.set(playerId, { id: playerId, name, isHost: true, ws, score: 0 });
      rooms.set(code, room);
      myRoomCode = code;
      myPlayerId = playerId;
      send(ws, { type: 'room', code, playerId, isHost: true, phase: room.phase, players: roomSnapshot(room) });
      return;
    }

    if (msg.type === 'join') {
      const code = String(msg.code || '').toUpperCase();
      const name = String(msg.name || 'Player').slice(0, 20) || 'Player';
      const room = rooms.get(code);
      if (!room) {
        send(ws, { type: 'error', message: 'No room found with code ' + code + '.' });
        return;
      }
      const playerId = genPlayerId();
      room.players.set(playerId, { id: playerId, name, isHost: false, ws, score: 0 });
      myRoomCode = code;
      myPlayerId = playerId;
      send(ws, {
        type: 'room',
        code,
        playerId,
        isHost: false,
        phase: room.phase,
        players: roomSnapshot(room),
        question: room.phase === 'question' || room.phase === 'reveal' ? publicQuestion(room, room.questionIndex) : null,
      });
      broadcastPlayers(code);
      return;
    }

    if (msg.type === 'rejoin') {
      const code = String(msg.code || '').toUpperCase();
      const playerId = String(msg.playerId || '');
      const room = rooms.get(code);
      if (!room || !room.players.has(playerId)) {
        send(ws, { type: 'error', message: 'That room is no longer available — join fresh.' });
        return;
      }
      const player = room.players.get(playerId);
      player.ws = ws;
      myRoomCode = code;
      myPlayerId = playerId;
      send(ws, {
        type: 'room',
        code,
        playerId,
        isHost: player.isHost,
        phase: room.phase,
        players: roomSnapshot(room),
        question: room.phase === 'question' || room.phase === 'reveal' ? publicQuestion(room, room.questionIndex) : null,
        alreadyAnswered: room.answers.has(playerId),
      });
      broadcastPlayers(code);
      return;
    }

    if (msg.type === 'startGame') {
      const room = rooms.get(myRoomCode);
      if (!room || !myPlayerId) return;
      const player = room.players.get(myPlayerId);
      if (!player || !player.isHost || room.phase !== 'lobby') return;
      room.mainSet = shuffle(MAIN_QUESTIONS);
      startWheel(myRoomCode, 0);
      return;
    }

    if (msg.type === 'answer') {
      const room = rooms.get(myRoomCode);
      if (!room || !myPlayerId) return;
      if (room.phase !== 'question') return;
      if (room.answers.has(myPlayerId)) return; // one answer per question
      const choice = Number(msg.choice);
      if (!Number.isInteger(choice) || choice < 0 || choice > 3) return;
      room.answers.set(myPlayerId, choice);
      broadcast(myRoomCode, {
        type: 'answerCount',
        answeredCount: answeredCount(room),
        playerCount: room.players.size,
      });
      if (answeredCount(room) >= room.players.size) {
        revealAnswer(myRoomCode);
      }
      return;
    }

    if (msg.type === 'nextQuestion') {
      const room = rooms.get(myRoomCode);
      if (!room || !myPlayerId) return;
      const player = room.players.get(myPlayerId);
      if (!player || !player.isHost || room.phase !== 'reveal') return;
      const next = room.questionIndex + 1;
      if (next >= room.mainSet.length) {
        room.phase = 'ended';
        broadcast(myRoomCode, { type: 'ended', players: roomSnapshot(room) });
      } else {
        startWheel(myRoomCode, next);
      }
      return;
    }
  });

  ws.on('close', () => {
    if (!myRoomCode || !myPlayerId) return;
    const room = rooms.get(myRoomCode);
    if (!room) return;
    const player = room.players.get(myPlayerId);
    if (player) {
      player.ws = null;
      broadcastPlayers(myRoomCode);
    }
    const codeAtClose = myRoomCode;
    setTimeout(() => {
      const r = rooms.get(codeAtClose);
      if (!r) return;
      const anyConnected = Array.from(r.players.values()).some((p) => p.ws);
      if (!anyConnected) {
        clearTimeout(r.timer);
        rooms.delete(codeAtClose);
      }
    }, 10 * 60 * 1000); // 10 minutes
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Trivia Night server listening on port ' + PORT);
});
