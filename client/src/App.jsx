import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";
import {
  COLOR_HEX,
  COLORS,
  GRID_SIZE,
  HOME_GRID,
  SAFE_TRACK_INDEXES,
  START_INDEX,
  TRACK_GRID,
  YARD_POSITIONS,
  positionForToken,
} from "./ludoBoard";

const DEFAULT_SERVER_URL = window.location.origin;
const SERVER_URL = import.meta.env.VITE_SERVER_URL || DEFAULT_SERVER_URL;
const SESSION_KEY = "ludo-session-id";
const STACK_OFFSETS = [
  [0, 0],
  [0.95, 0],
  [-0.95, 0],
  [0, 0.95],
  [0, -0.95],
  [0.75, 0.75],
  [-0.75, 0.75],
  [0.75, -0.75],
  [-0.75, -0.75],
];
const DICE_PIPS = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

function cellKey(row, col) {
  return `${row},${col}`;
}

function diceFace(value) {
  return DICE_PIPS[value] || [];
}

function makeSessionId() {
  const source = crypto.getRandomValues(new Uint32Array(4));
  return Array.from(source, (n) => n.toString(36)).join("");
}

function getOrCreateSessionId() {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = makeSessionId();
  localStorage.setItem(SESSION_KEY, next);
  return next;
}

function playTone(type) {
  const context = new window.AudioContext();
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.connect(gain);
  gain.connect(context.destination);

  const preset = type === "dice" ? { freq: 660, duration: 0.12 } : { freq: 420, duration: 0.16 };

  osc.type = type === "dice" ? "triangle" : "sine";
  osc.frequency.value = preset.freq;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + preset.duration);
  osc.start();
  osc.stop(context.currentTime + preset.duration);
  osc.onended = () => {
    context.close();
  };
}

function getTimerSeconds(turnExpiresAt) {
  if (!turnExpiresAt) return 0;
  return Math.max(0, Math.ceil((turnExpiresAt - Date.now()) / 1000));
}

function App() {
  const [socket] = useState(() =>
    io(SERVER_URL, {
      autoConnect: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      timeout: 10000,
    }),
  );
  const [username, setUsername] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomState, setRoomState] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [timer, setTimer] = useState(0);
  const [socketStatus, setSocketStatus] = useState("connecting");
  const [isRolling, setIsRolling] = useState(false);
  const [rollingFace, setRollingFace] = useState(1);
  const [lastStableDiceValue, setLastStableDiceValue] = useState(1);

  const prevStateRef = useRef(null);
  const rollIntervalRef = useRef(null);
  const rollStopTimeoutRef = useRef(null);
  const rollingFaceRef = useRef(1);
  const sessionId = useMemo(() => getOrCreateSessionId(), []);
  const boardCells = useMemo(() => {
    const trackKeys = new Set(TRACK_GRID.map(([r, c]) => cellKey(r, c)));
    const safeKeys = new Set(SAFE_TRACK_INDEXES.map((i) => {
      const [r, c] = TRACK_GRID[i];
      return cellKey(r, c);
    }));
    const startMap = new Map(
      COLORS.map((color) => {
        const [r, c] = TRACK_GRID[START_INDEX[color]];
        return [cellKey(r, c), color];
      }),
    );
    const homeMap = new Map();
    Object.entries(HOME_GRID).forEach(([color, cells]) => {
      cells.forEach(([r, c]) => homeMap.set(cellKey(r, c), color));
    });

    const cells = [];
    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const key = cellKey(row, col);
        const classes = ["board-cell"];

        if (trackKeys.has(key)) classes.push("track");
        if (safeKeys.has(key)) classes.push("safe");
        if (homeMap.has(key)) classes.push("home", homeMap.get(key));
        if (startMap.has(key)) classes.push("start", startMap.get(key));

        if (classes.length > 1) {
          cells.push({ key, classes: classes.join(" "), row, col });
        }
      }
    }
    return cells;
  }, []);

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }
  }, [socket]);

  useEffect(() => {
    const onConnect = () => {
      setSocketStatus("connected");
    };
    const onDisconnect = () => {
      setSocketStatus("disconnected");
    };
    const onError = (err) => {
      setSocketStatus("error");
      if (err?.message) {
        setError(`Socket error: ${err.message}`);
      }
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onError);
    };
  }, [socket]);

  useEffect(() => {
    const onRoomState = (nextState) => {
      const prev = prevStateRef.current;
      if (soundOn && prev?.game?.diceValue !== nextState?.game?.diceValue && nextState?.game?.diceValue) {
        playTone("dice");
      }
      if (soundOn && prev?.game?.animationTick !== nextState?.game?.animationTick && prev) {
        playTone("move");
      }

      prevStateRef.current = nextState;
      setRoomState(nextState);
      setTimer(getTimerSeconds(nextState?.game?.turnExpiresAt));
    };

    socket.on("roomState", onRoomState);
    return () => {
      socket.off("roomState", onRoomState);
    };
  }, [socket, soundOn]);

  useEffect(() => {
    const id = setInterval(() => {
      setTimer(getTimerSeconds(roomState?.game?.turnExpiresAt));
    }, 500);
    return () => clearInterval(id);
  }, [roomState?.game?.turnExpiresAt]);

  useEffect(() => () => {
    if (rollIntervalRef.current) {
      window.clearInterval(rollIntervalRef.current);
    }
    if (rollStopTimeoutRef.current) {
      window.clearTimeout(rollStopTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    const incomingDice = roomState?.game?.diceValue;
    if (!incomingDice) return;
    if (rollIntervalRef.current) {
      window.clearInterval(rollIntervalRef.current);
      rollIntervalRef.current = null;
    }
    setLastStableDiceValue(incomingDice);
    rollingFaceRef.current = incomingDice;
    setRollingFace(incomingDice);
    setIsRolling(false);
  }, [roomState?.game?.diceValue]);

  useEffect(() => {
    const serverLastDice = roomState?.game?.lastDiceValue;
    if (typeof serverLastDice === "number" && serverLastDice >= 1 && serverLastDice <= 6) {
      setLastStableDiceValue(serverLastDice);
    }
  }, [roomState?.game?.lastDiceValue]);

  const me = useMemo(() => {
    if (!roomState || !username) return null;
    return roomState.participants.find((p) => p.username.toLowerCase() === username.toLowerCase()) || null;
  }, [roomState, username]);

  const currentColor = roomState?.game?.currentColor;
  const isMyTurn = me?.color && me.color === currentColor;
  const canRoll = isMyTurn && !roomState?.game?.awaitingMove;
  const canMove = isMyTurn && roomState?.game?.awaitingMove;
  const canStart = roomState?.game?.status === "lobby" && (roomState?.participants.filter((p) => p.role === "player").length || 0) >= 2;
  const tokenViews = useMemo(() => {
    const groups = new Map();
    const views = [];
    const board = roomState?.game?.board || {};
    const players = (roomState?.participants || []).filter((p) => p.role === "player");
    const colorsInPlay = roomState?.game?.colorsInPlay || [];
    const visibleColors = roomState?.game?.status === "lobby"
      ? COLORS.slice(0, Math.min(players.length, 4))
      : colorsInPlay;

    visibleColors.forEach((color) => {
      const tokens = board[color] || [-1, -1, -1, -1];
      tokens.forEach((progress, tokenIndex) => {
        const pos = positionForToken(color, tokenIndex, progress);
        const key = `${pos.x.toFixed(2)}:${pos.y.toFixed(2)}`;
        const currentGroup = groups.get(key) || 0;
        groups.set(key, currentGroup + 1);

        const [ox, oy] = STACK_OFFSETS[currentGroup] || [0, 0];
        views.push({
          key: `${color}-${tokenIndex}`,
          color,
          tokenIndex,
          left: pos.x + ox,
          top: pos.y + oy,
        });
      });
    });

    return views;
  }, [roomState?.game?.board, roomState?.game?.colorsInPlay, roomState?.game?.status, roomState?.participants]);
  const shownDiceValue = isRolling
    ? rollingFace
    : (roomState?.game?.diceValue ?? roomState?.game?.lastDiceValue ?? lastStableDiceValue);
  const cornerPlayers = useMemo(() => {
    const players = (roomState?.participants || []).filter((p) => p.role === "player");
    const byColor = new Map();

    players.forEach((p, idx) => {
      const slotColor = p.color || COLORS[idx % COLORS.length];
      if (!byColor.has(slotColor)) {
        byColor.set(slotColor, { ...p, slotColor });
      }
    });

    return byColor;
  }, [roomState?.participants]);

  function validateUsername(raw) {
    const next = raw.trim();
    if (!/^[A-Za-z]{1,20}$/.test(next)) {
      return "Username must be 1-20 letters";
    }
    return "";
  }

  function withAck(event, payload) {
    return new Promise((resolve) => {
      if (!socket.connected) {
        socket.connect();
      }

      socket.timeout(8000).emit(event, payload, (err, res) => {
        if (err) {
          resolve({ ok: false, error: `Server not reachable at ${SERVER_URL}` });
          return;
        }
        resolve(res);
      });
    });
  }

  async function createRoom() {
    const validation = validateUsername(username);
    if (validation) {
      setError(validation);
      return;
    }

    setLoading(true);
    setError("");
    const res = await withAck("createRoom", {
      username: username.trim(),
      sessionId,
    });
    setLoading(false);

    if (!res?.ok) {
      setError(res?.error || "Failed to create room");
      return;
    }

    setRoomCode(res.roomCode);
  }

  async function joinRoom() {
    const validation = validateUsername(username);
    if (validation) {
      setError(validation);
      return;
    }

    if (!/^\d{6}$/.test(roomCodeInput.trim())) {
      setError("Room code must be 6 digits");
      return;
    }

    setLoading(true);
    setError("");
    const normalizedCode = roomCodeInput.trim();
    const res = await withAck("joinRoom", {
      roomCode: normalizedCode,
      username: username.trim(),
      sessionId,
    });
    setLoading(false);

    if (!res?.ok) {
      setError(res?.error || "Failed to join room");
      return;
    }

    setRoomCode(normalizedCode);
  }

  async function startGame() {
    const res = await withAck("startGame", { roomCode });
    if (!res?.ok) {
      setError(res?.error || "Could not start game");
    }
  }

  async function rollDice() {
    setError("");
    if (rollIntervalRef.current) {
      window.clearInterval(rollIntervalRef.current);
    }
    if (rollStopTimeoutRef.current) {
      window.clearTimeout(rollStopTimeoutRef.current);
    }

    setIsRolling(true);
    rollIntervalRef.current = window.setInterval(() => {
      const nextFace = 1 + Math.floor(Math.random() * 6);
      rollingFaceRef.current = nextFace;
      setRollingFace(nextFace);
    }, 90);

    rollStopTimeoutRef.current = window.setTimeout(() => {
      if (rollIntervalRef.current) {
        window.clearInterval(rollIntervalRef.current);
        rollIntervalRef.current = null;
      }
      setIsRolling(false);
    }, 500);

    const res = await withAck("rollDice", { roomCode, sessionId });
    if (!res?.ok) {
      if (rollIntervalRef.current) {
        window.clearInterval(rollIntervalRef.current);
        rollIntervalRef.current = null;
      }
      if (rollStopTimeoutRef.current) {
        window.clearTimeout(rollStopTimeoutRef.current);
        rollStopTimeoutRef.current = null;
      }
      setIsRolling(false);
      setError(res?.error || "Could not roll dice");
    }
  }

  async function moveToken(tokenIndex) {
    const res = await withAck("moveToken", { roomCode, sessionId, tokenIndex });
    if (!res?.ok) {
      setError(res?.error || "Could not move token");
    }
  }

  if (!roomCode) {
    return (
      <div className="page page-entry">
        <div className="card entry-card">
          <h1>Play Ludo Online</h1>
          <p className="subtitle">Minimal, playful and realtime. Invite friends with a 6-digit code.</p>

          <label htmlFor="username">Username</label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="letters only"
            maxLength={20}
          />

          <label htmlFor="roomCode">Room Code (to join)</label>
          <input
            id="roomCode"
            value={roomCodeInput}
            onChange={(e) => setRoomCodeInput(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            placeholder="123456"
            inputMode="numeric"
          />

          <div className="entry-actions">
            <button disabled={loading} onClick={createRoom}>Create Room</button>
            <button className="ghost" disabled={loading} onClick={joinRoom}>Join Room</button>
          </div>

          {error ? <p className="error">{error}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="page page-game">
      <header className="topbar">
        <div>
          <h2>Room {roomCode}</h2>
          <p className="subtitle">Share this code with friends</p>
          <p className={`socket-status ${socketStatus}`}>Server: {socketStatus}</p>
        </div>
        <div className="top-actions">
          <button className="ghost" onClick={() => setSoundOn((v) => !v)}>{soundOn ? "Sound On" : "Sound Off"}</button>
          <span className="timer">{timer}s</span>
        </div>
      </header>

      {roomState?.game?.winner ? (
        <div className="win-banner" style={{ "--winner": COLOR_HEX[roomState.game.winner] }}>
          {roomState.game.winner.toUpperCase()} wins!
        </div>
      ) : null}

      <main className="game-grid">
        <section className="board-wrap">
          <div className="board">
            <div className="yard-zone red">
            </div>
            <div className="yard-zone green">
            </div>
            <div className="yard-zone yellow">
            </div>
            <div className="yard-zone blue">
            </div>
            {COLORS.map((color) => {
              const p = cornerPlayers.get(color);
              if (!p) return null;

              return (
                <div key={color} className={`player-corner ${color}`}>
                  <div className={`player-chip ${p.color === currentColor ? "turn" : ""}`}>
                    <span className="dot" style={{ background: COLOR_HEX[color] }} />
                    <strong>{p.username}</strong>
                    {!p.isConnected ? <span className="muted">offline</span> : null}
                  </div>
                </div>
              );
            })}
            <div className="board-grid">
              {boardCells.map((cell) => (
                <span
                  key={cell.key}
                  className={cell.classes}
                  style={{ gridRow: cell.row + 1, gridColumn: cell.col + 1 }}
                />
              ))}
            </div>
            {Object.entries(YARD_POSITIONS).flatMap(([color, positions]) =>
              positions.map((pos, index) => (
                <span
                  key={`${color}-slot-${index}`}
                  className={`yard-slot ${color}`}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                />
              )),
            )}
            <div className="home-center" />

            {tokenViews.map((token) => {
              const canClick = canMove && me?.color === token.color && roomState.game.movableTokens.includes(token.tokenIndex);
              return (
                <button
                  key={token.key}
                  className={`token ${token.color} ${canClick ? "can-move" : ""}`}
                  style={{ left: `${token.left}%`, top: `${token.top}%` }}
                  onClick={() => canClick && moveToken(token.tokenIndex)}
                />
              );
            })}

            <div className={`dice ${canRoll ? "active" : ""}`} onClick={() => canRoll && rollDice()}>
              <div className={`dice-cube ${isRolling ? "rolling" : `show-${shownDiceValue}`}`}>
                {[1, 2, 3, 4, 5, 6].map((value) => (
                  <div key={value} className={`dice-side side-${value}`}>
                    {diceFace(value).map((pip) => <span key={`${value}-${pip}`} className={`pip p${pip}`} />)}
                  </div>
                ))}
              </div>
            </div>

            {roomState?.game?.status === "lobby" ? (
              <button className="start-center-btn" onClick={startGame} disabled={!canStart}>Start Game</button>
            ) : null}
          </div>

          <p className="status board-status">{roomState?.game?.lastAction}</p>
        </section>
      </main>

      {error ? <p className="error floating">{error}</p> : null}
    </div>
  );
}

export default App;
