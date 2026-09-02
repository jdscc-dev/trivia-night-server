const express = require('express');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// --- Placeholder question bank (test slice only — real categories come later) ---
const QUESTIONS = [
  { q: 'What is the capital of France?', choices: ['Berlin', 'Madrid', 'Paris', 'Rome'], correct: 2 },
  { q: 'Which planet is known as the Red Planet?', choices: ['Venus', 'Mars', 'Jupiter', 'Saturn'], correct: 1 },
  { q: 'How many continents are there on Earth?', choices: ['5', '6', '7', '8'], correct: 2 },
  { q: 'Who wrote "Romeo and Juliet"?', choices: ['Charles Dickens', 'William Shakespeare', 'Mark Twain', 'Jane Austen'], correct: 1 },
];
const QUESTION_TIME_MS = 15000;

// In-memory room state.
// code -> {
//   players: Map(playerId -> { id, name, isHost, ws, score }),
//   phase: 'lobby' | 'question' | 'reveal' | 'ended',
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

function publicQuestion(index) {
  const q = QUESTIONS[index];
  return { index, total: QUESTIONS.length, q: q.q, choices: q.choices, timeMs: QUESTION_TIME_MS };
}

function answeredCount(room) {
  return room.answers.size;
}

function startQuestion(code, index) {
  const room = rooms.get(code);
  if (!room) return;
  room.phase = 'question';
  room.questionIndex = index;
  room.answers = new Map();
  broadcast(code, {
    type: 'question',
    ...publicQuestion(index),
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

  const q = QUESTIONS[room.questionIndex];
  const answerMap = {};
  for (const [playerId, choice] of room.answers.entries()) {
    answerMap[playerId] = choice;
    if (choice === q.correct) {
      const player = room.players.get(playerId);
      if (player) player.score += 1;
    }
  }

  const isLast = room.questionIndex >= QUESTIONS.length - 1;
  broadcast(code, {
    type: 'reveal',
    index: room.questionIndex,
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
      const room = { players: new Map(), phase: 'lobby', questionIndex: -1, answers: new Map(), timer: null };
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
        question: room.phase === 'question' || room.phase === 'reveal' ? publicQuestion(room.questionIndex) : null,
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
        question: room.phase === 'question' || room.phase === 'reveal' ? publicQuestion(room.questionIndex) : null,
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
      startQuestion(myRoomCode, 0);
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
      if (next >= QUESTIONS.length) {
        room.phase = 'ended';
        broadcast(myRoomCode, { type: 'ended', players: roomSnapshot(room) });
      } else {
        startQuestion(myRoomCode, next);
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
