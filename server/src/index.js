import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 4000;
const TURN_SECONDS = 20;
const RECONNECT_GRACE_MS = 60_000;

const COLORS = ["red", "green", "yellow", "blue"];
const DIAGONAL_COLOR_PAIRS = [
  ["red", "yellow"],
  ["green", "blue"],
];
const START_INDEX = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};
const SAFE_GLOBAL_INDEXES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

const rooms = new Map();

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, '..', 'dist')));
app.get("/health", (_req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});

// Serve index.html for the root path
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

function randomCode() {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += String(Math.floor(Math.random() * 10));
  }
  return code;
}

function uniqueCode() {
  let code = randomCode();
  while (rooms.has(code)) {
    code = randomCode();
  }
  return code;
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function roomPlayers(room) {
  return room.participants.filter((p) => p.role === "player");
}

function findBySession(room, sessionId) {
  if (!sessionId) return null;
  return room.participants.find((p) => p.sessionId === sessionId) || null;
}

function usernameExists(room, username, exceptSessionId) {
  const lower = username.toLowerCase();
  return room.participants.some(
    (p) => p.username.toLowerCase() === lower && p.sessionId !== exceptSessionId,
  );
}

function createRoom(code) {
  const room = {
    code,
    createdAt: Date.now(),
    participants: [],
    game: {
      status: "lobby",
      colorsInPlay: [],
      order: [],
      turnIndex: 0,
      diceValue: null,
      lastDiceValue: 1,
      awaitingMove: false,
      movableTokens: [],
      sixStreak: 0,
      turnExpiresAt: null,
      board: {},
      winner: null,
      lastAction: "Waiting for players",
      animationTick: 0,
    },
    turnTimeout: null,
  };
  rooms.set(code, room);
  return room;
}

function getGlobalIndex(color, progress) {
  if (progress < 0 || progress > 51) return null;
  return (START_INDEX[color] + progress) % 52;
}

function getMovableTokens(game, color, diceValue) {
  const tokens = game.board[color];
  
  // Safety check: ensure tokens array exists and is valid
  if (!tokens || !Array.isArray(tokens) || tokens.length !== 4) {
    // If board is corrupted, reinitialize this color's tokens
    console.warn(`Board corruption detected for color ${color}. Reinitializing.`);
    game.board[color] = [-1, -1, -1, -1];
    return [];
  }

  const movable = [];
  tokens.forEach((progress, tokenIndex) => {
    if (progress === 57) return; // Already finished
    
    if (progress === -1) {
      // Token in yard - can only move with 6
      if (diceValue === 6) {
        movable.push(tokenIndex);
      }
      return;
    }

    // Token on board - can move if within bounds
    const target = progress + diceValue;
    if (target <= 57) {
      movable.push(tokenIndex);
    }
  });

  return movable;
}

function nextTurn(game) {
  if (game.order.length === 0) return;
  game.turnIndex = (game.turnIndex + 1) % game.order.length;
  game.diceValue = null;
  game.awaitingMove = false;
  game.movableTokens = [];
  game.sixStreak = 0;
}

function emitRoom(room) {
  io.to(room.code).emit("roomState", serializeRoom(room));
}

function startTurnTimer(room) {
  const game = room.game;
  if (room.turnTimeout) {
    clearTimeout(room.turnTimeout);
  }

  if (game.status !== "playing") {
    game.turnExpiresAt = null;
    return;
  }

  game.turnExpiresAt = Date.now() + TURN_SECONDS * 1000;
  room.turnTimeout = setTimeout(() => {
    const currentColor = game.order[game.turnIndex];
    game.lastAction = `${currentColor} timed out`;
    nextTurn(game);
    game.animationTick += 1;
    startTurnTimer(room);
    emitRoom(room);
  }, TURN_SECONDS * 1000);
}

function maybeFinishGame(room) {
  const game = room.game;
  if (game.status !== "playing") return;
  if (game.order.length <= 1) {
    game.status = "finished";
    game.winner = game.finishedOrder[0] || null;
    game.diceValue = null;
    game.awaitingMove = false;
    game.movableTokens = [];
    game.turnExpiresAt = null;
    if (room.turnTimeout) {
      clearTimeout(room.turnTimeout);
      room.turnTimeout = null;
    }
    if (game.winner) {
      game.lastAction = `${game.winner} won the match`;
    }
  }
}

function removeColorFromGame(room, color, reason) {
  const game = room.game;
  if (!game.colorsInPlay.includes(color)) return;

  game.colorsInPlay = game.colorsInPlay.filter((c) => c !== color);
  game.finishedOrder.push(color);
  const idx = game.order.indexOf(color);
  if (idx !== -1) {
    game.order.splice(idx, 1);
    if (idx < game.turnIndex) {
      game.turnIndex -= 1;
    }
    if (game.turnIndex >= game.order.length) {
      game.turnIndex = 0;
    }
  }
  delete game.board[color];
  game.lastAction = reason;

  const player = room.participants.find((p) => p.color === color);
  if (player) {
    player.color = null;
    player.role = "spectator";
  }

  maybeFinishGame(room);
}

function startGame(room) {
  const players = roomPlayers(room).slice(0, 4);
  if (players.length < 2) {
    return { ok: false, error: "Need at least 2 players" };
  }

  let chosenColors;
  if (players.length === 2) {
    chosenColors = shuffle(DIAGONAL_COLOR_PAIRS[Math.floor(Math.random() * DIAGONAL_COLOR_PAIRS.length)]);
  } else {
    const colorPool = shuffle(COLORS);
    chosenColors = colorPool.slice(0, players.length);
  }
  const order = shuffle(chosenColors);

  players.forEach((player, i) => {
    player.color = chosenColors[i];
  });

  const board = {};
  chosenColors.forEach((color) => {
    board[color] = [-1, -1, -1, -1];
  });

  room.game = {
    status: "playing",
    colorsInPlay: chosenColors,
    order,
    turnIndex: Math.floor(Math.random() * order.length),
    diceValue: null,
    lastDiceValue: 1,
    awaitingMove: false,
    movableTokens: [],
    sixStreak: 0,
    turnExpiresAt: null,
    board,
    winner: null,
    finishedOrder: [],
    lastAction: "Game started",
    animationTick: room.game.animationTick + 1,
  };

  startTurnTimer(room);
  return { ok: true };
}

function serializeRoom(room) {
  const game = room.game;
  return {
    roomCode: room.code,
    game: {
      status: game.status,
      colorsInPlay: game.colorsInPlay,
      order: game.order,
      turnIndex: game.turnIndex,
      currentColor: game.order[game.turnIndex] || null,
      diceValue: game.diceValue,
      lastDiceValue: game.lastDiceValue,
      awaitingMove: game.awaitingMove,
      movableTokens: game.movableTokens,
      turnExpiresAt: game.turnExpiresAt,
      board: game.board,
      winner: game.winner,
      finishedOrder: game.finishedOrder,
      lastAction: game.lastAction,
      animationTick: game.animationTick,
      safeGlobalIndexes: [...SAFE_GLOBAL_INDEXES],
      startIndex: START_INDEX,
    },
    participants: room.participants.map((p) => ({
      username: p.username,
      role: p.role,
      color: p.color,
      isConnected: p.isConnected,
    })),
  };
}

function joinAsParticipant({ room, socket, username, sessionId }) {
  const reconnect = findBySession(room, sessionId);

  if (reconnect) {
    reconnect.socketId = socket.id;
    reconnect.isConnected = true;
    reconnect.reconnectDeadline = null;
    socket.join(room.code);
    return { ok: true, roomCode: room.code, sessionId: reconnect.sessionId };
  }

  if (usernameExists(room, username, null)) {
    return { ok: false, error: "Username already taken in this room" };
  }

  const activeCount = roomPlayers(room).length;
  const asSpectator = room.game.status !== "lobby" || activeCount >= 4;

  const participant = {
    socketId: socket.id,
    sessionId,
    username,
    role: asSpectator ? "spectator" : "player",
    color: null,
    isConnected: true,
    reconnectDeadline: null,
    joinedAt: Date.now(),
  };

  room.participants.push(participant);
  socket.join(room.code);
  return { ok: true, roomCode: room.code, sessionId };
}

function moveToken(game, color, tokenIndex, diceValue) {
  const tokens = game.board[color];
  const current = tokens[tokenIndex];
  let target = current;

  if (current === -1) {
    if (diceValue !== 6) return { ok: false, error: "Need 6 to enter board" };
    target = 0;
  } else {
    const next = current + diceValue;
    if (next > 57) {
      return { ok: false, error: "Exact roll required to finish" };
    }
    target = next;
  }

  tokens[tokenIndex] = target;

  let captured = false;
  const targetGlobal = getGlobalIndex(color, target);
  if (targetGlobal !== null && !SAFE_GLOBAL_INDEXES.has(targetGlobal)) {
    game.colorsInPlay.forEach((opColor) => {
      if (opColor === color) return;
      game.board[opColor] = game.board[opColor].map((opProgress) => {
        const opGlobal = getGlobalIndex(opColor, opProgress);
        if (opGlobal === targetGlobal) {
          captured = true;
          return -1;
        }
        return opProgress;
      });
    });
  }

  const allHome = game.board[color].every((p) => p === 57);
  return { ok: true, captured, allHome };
}

function resolveTokenMove(room, player, tokenIndex, { auto } = { auto: false }) {
  const game = room.game;
  const result = moveToken(game, player.color, tokenIndex, game.diceValue);
  if (!result.ok) {
    return result;
  }

  game.animationTick += 1;
  game.awaitingMove = false;
  game.movableTokens = [];

  const movedTo = game.board[player.color][tokenIndex];
  const finishedToken = movedTo === 57;

  if (result.allHome) {
    removeColorFromGame(room, player.color, `${player.username} completed all tokens`);
    maybeFinishGame(room);
    if (room.game.status === "finished") {
      return { ok: true };
    }
  }

  const extraTurn = game.diceValue === 6 || result.captured || finishedToken;
  game.lastAction = `${player.username}${auto ? " auto-moved" : " moved"} token ${tokenIndex + 1}${result.captured ? " and captured" : ""}${finishedToken ? " to home" : ""}`;

  if (!extraTurn) {
    nextTurn(game);
  } else {
    game.diceValue = null;
    // Don't reset sixStreak on extra turns - it should persist across extra turns
    // sixStreak is only reset when nextTurn() is called
    game.awaitingMove = false;
    game.movableTokens = [];
  }

  startTurnTimer(room);
  return { ok: true };
}

io.on("connection", (socket) => {
  socket.on("createRoom", (payload, callback) => {
    const username = String(payload?.username || "").trim();
    const sessionId = String(payload?.sessionId || "").trim();

    if (!/^[A-Za-z]{1,20}$/.test(username)) {
      callback({ ok: false, error: "Username must be 1-20 letters" });
      return;
    }

    if (!/^[A-Za-z0-9_-]{8,50}$/.test(sessionId)) {
      callback({ ok: false, error: "Invalid session id" });
      return;
    }

    const code = uniqueCode();
    const room = createRoom(code);
    const result = joinAsParticipant({ room, socket, username, sessionId });

    callback(result);
    emitRoom(room);
  });

  socket.on("joinRoom", (payload, callback) => {
    const roomCode = String(payload?.roomCode || "").trim();
    const username = String(payload?.username || "").trim();
    const sessionId = String(payload?.sessionId || "").trim();

    if (!/^\d{6}$/.test(roomCode)) {
      callback({ ok: false, error: "Room code must be 6 digits" });
      return;
    }

    if (!/^[A-Za-z]{1,20}$/.test(username)) {
      callback({ ok: false, error: "Username must be 1-20 letters" });
      return;
    }

    if (!/^[A-Za-z0-9_-]{8,50}$/.test(sessionId)) {
      callback({ ok: false, error: "Invalid session id" });
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
      callback({ ok: false, error: "Room not found" });
      return;
    }

    const result = joinAsParticipant({ room, socket, username, sessionId });
    callback(result);
    emitRoom(room);
  });

  socket.on("startGame", (payload, callback) => {
    const roomCode = String(payload?.roomCode || "").trim();
    const room = rooms.get(roomCode);
    if (!room) {
      callback({ ok: false, error: "Room not found" });
      return;
    }

    if (room.game.status !== "lobby") {
      callback({ ok: false, error: "Game already started" });
      return;
    }

    const result = startGame(room);
    callback(result);
    emitRoom(room);
  });

  socket.on("rollDice", (payload, callback) => {
    const roomCode = String(payload?.roomCode || "").trim();
    const sessionId = String(payload?.sessionId || "").trim();
    const room = rooms.get(roomCode);

    if (!room) {
      callback({ ok: false, error: "Room not found" });
      return;
    }

    const game = room.game;
    if (game.status !== "playing") {
      callback({ ok: false, error: "Game is not active" });
      return;
    }

    const player = findBySession(room, sessionId);
    if (!player || player.role !== "player" || !player.color) {
      callback({ ok: false, error: "You are not an active player" });
      return;
    }

    const currentColor = game.order[game.turnIndex];
    if (player.color !== currentColor) {
      callback({ ok: false, error: "Not your turn" });
      return;
    }

    if (game.awaitingMove) {
      callback({ ok: false, error: "Choose a token first" });
      return;
    }

    const diceValue = 1 + Math.floor(Math.random() * 6);
    game.diceValue = diceValue;
    game.lastDiceValue = diceValue;
    game.animationTick += 1;
    game.lastAction = `${player.username} rolled ${diceValue}`;

    if (diceValue === 6) {
      game.sixStreak += 1;
    } else {
      game.sixStreak = 0;
    }

    if (game.sixStreak >= 3) {
      game.lastAction = `${player.username} rolled three 6s and lost turn`;
      nextTurn(game);
      startTurnTimer(room);
      callback({ ok: true });
      emitRoom(room);
      return;
    }

    const movable = getMovableTokens(game, player.color, diceValue);
    game.movableTokens = movable;

    if (movable.length === 0) {
      game.lastAction = `${player.username} has no legal move`;
      nextTurn(game);
      startTurnTimer(room);
      callback({ ok: true });
      emitRoom(room);
      return;
    }

    if (movable.length === 1) {
      game.awaitingMove = true;
      const autoResult = resolveTokenMove(room, player, movable[0], { auto: true });
      callback(autoResult);
      emitRoom(room);
      return;
    }

    game.awaitingMove = true;
    startTurnTimer(room);
    callback({ ok: true });
    emitRoom(room);
  });

  socket.on("moveToken", (payload, callback) => {
    const roomCode = String(payload?.roomCode || "").trim();
    const sessionId = String(payload?.sessionId || "").trim();
    const tokenIndex = Number(payload?.tokenIndex);

    const room = rooms.get(roomCode);
    if (!room) {
      callback({ ok: false, error: "Room not found" });
      return;
    }

    const game = room.game;
    if (game.status !== "playing") {
      callback({ ok: false, error: "Game is not active" });
      return;
    }

    const player = findBySession(room, sessionId);
    if (!player || player.role !== "player" || !player.color) {
      callback({ ok: false, error: "You are not an active player" });
      return;
    }

    const currentColor = game.order[game.turnIndex];
    if (player.color !== currentColor) {
      callback({ ok: false, error: "Not your turn" });
      return;
    }

    if (!game.awaitingMove) {
      callback({ ok: false, error: "Roll dice first" });
      return;
    }

    if (game.diceValue === null) {
      callback({ ok: false, error: "Roll dice first" });
      return;
    }

    if (!game.movableTokens.includes(tokenIndex)) {
      callback({ ok: false, error: "Token cannot be moved" });
      return;
    }

    const moveResult = resolveTokenMove(room, player, tokenIndex, { auto: false });
    callback(moveResult);
    emitRoom(room);
  });

  socket.on("forfeit", (payload, callback) => {
    const roomCode = String(payload?.roomCode || "").trim();
    const sessionId = String(payload?.sessionId || "").trim();
    const room = rooms.get(roomCode);

    if (!room) {
      callback({ ok: false, error: "Room not found" });
      return;
    }

    const game = room.game;
    if (game.status !== "playing") {
      callback({ ok: false, error: "Game is not active" });
      return;
    }

    const player = findBySession(room, sessionId);
    if (!player || player.role !== "player" || !player.color) {
      callback({ ok: false, error: "You are not an active player" });
      return;
    }

    // Remove the forfeiting player from the game
    removeColorFromGame(room, player.color, `${player.username} forfeited`);
    maybeFinishGame(room);
    if (room.game.status === "finished") {
      // Game is over
    }

    callback({ ok: true });
    emitRoom(room);
  });

  socket.on("disconnect", () => {
    rooms.forEach((room) => {
      const player = room.participants.find((p) => p.socketId === socket.id);
      if (!player) return;

      player.isConnected = false;
      player.reconnectDeadline = Date.now() + RECONNECT_GRACE_MS;

      if (player.role === "spectator") {
        room.participants = room.participants.filter((p) => p.sessionId !== player.sessionId);
      }

      emitRoom(room);
    });
  });
});

setInterval(() => {
  const now = Date.now();

  rooms.forEach((room, code) => {
    room.participants = room.participants.filter((p) => {
      if (p.isConnected) return true;
      if (!p.reconnectDeadline || p.reconnectDeadline > now) return true;

      if (p.role === "player" && p.color && room.game.status === "playing") {
        removeColorFromGame(room, p.color, `${p.username} left after reconnect grace period`);
      }
      return false;
    });

    if (room.participants.length === 0) {
      if (room.turnTimeout) {
        clearTimeout(room.turnTimeout);
      }
      rooms.delete(code);
      return;
    }

    emitRoom(room);
  });
}, 5_000);

httpServer.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`Ludo server running on port ${PORT}`);
});
