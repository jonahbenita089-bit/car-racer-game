const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const startScreen = document.getElementById("startScreen");
const controlsLayer = document.getElementById("controlsLayer");

const WORLD = {
  width: 1000,
  height: 4600,
  finishY: 4200
};

const COLORS = [
  "#f4d35e", "#ff6b6b", "#4ecdc4", "#5dade2", "#f7b267", "#c77dff",
  "#7ae582", "#ffd166", "#ff9f1c", "#5f6fff", "#f72585", "#90be6d"
];

const state = {
  mode: 1,
  started: false,
  cars: [],
  players: [],
  aiCars: [],
  raceEnded: false,
  countdown: 0,
  lastTime: 0,
  winner: null
};

const playerKeyMap = {
  0: { left: "ArrowLeft", right: "ArrowRight", accel: "ArrowUp", brake: "ArrowDown" },
  1: { left: "a", right: "d", accel: "w", brake: "s" },
  2: { left: "j", right: "l", accel: "i", brake: "k" },
  3: { left: "1", right: "3", accel: "2", brake: "4" }
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function createCar({ id, x, y, angle, isPlayer, playerIndex, labelOverride, colorOverride }) {
  return {
    id,
    x,
    y,
    w: 52,
    h: 90,
    angle,
    speed: 0,
    steer: 0,
    maxSpeed: isPlayer ? 560 : rand(360, 520),
    accel: isPlayer ? 260 : rand(180, 250),
    brake: isPlayer ? 320 : 250,
    friction: 0.985,
    isPlayer,
    playerIndex,
    distance: 0,
    alive: true,
    control: { left: false, right: false, accel: false, brake: false },
    label: labelOverride || (isPlayer ? `P${playerIndex + 1}` : `AI-${id}`),
    color: colorOverride || COLORS[id % COLORS.length],
    isCopilot: labelOverride === "Copilot"
  };
}

function getViewRects(playerCount) {
  const rects = [];
  const W = canvas.width;
  const H = canvas.height;

  if (playerCount === 1) return [{ x: 0, y: 0, w: W, h: H }];

  if (playerCount === 2) {
    return [
      { x: 0, y: 0, w: W, h: H / 2 },
      { x: 0, y: H / 2, w: W, h: H / 2 }
    ];
  }

  if (playerCount === 3) {
    return [
      { x: 0, y: 0, w: W, h: H / 2 },
      { x: 0, y: H / 2, w: W / 2, h: H / 2 },
      { x: W / 2, y: H / 2, w: W / 2, h: H / 2 }
    ];
  }

  return [
    { x: 0, y: 0, w: W / 2, h: H / 2 },
    { x: W / 2, y: 0, w: W / 2, h: H / 2 },
    { x: 0, y: H / 2, w: W / 2, h: H / 2 },
    { x: W / 2, y: H / 2, w: W / 2, h: H / 2 }
  ];
}

function clearControls() {
  controlsLayer.innerHTML = "";
}

function buildControls(playerCount) {
  const rects = getViewRects(playerCount);

  for (let i = 0; i < playerCount; i++) {
    const wrap = document.createElement("div");
    wrap.className = "player-controls";
    wrap.style.position = "absolute";
    wrap.style.left = `${rects[i].x}px`;
    wrap.style.top = `${rects[i].y}px`;
    wrap.style.width = `${rects[i].w}px`;
    wrap.style.height = `${rects[i].h}px`;
    wrap.style.pointerEvents = "none";

    const label = document.createElement("div");
    label.className = "player-label";
    label.textContent = `PLAYER ${i + 1}`;
    wrap.appendChild(label);

    const buttonDefs = [
      { type: "left", icon: "◀", left: 12, bottom: 12 },
      { type: "right", icon: "▶", left: 94, bottom: 12 },
      { type: "accel", icon: "▲", right: 12, top: 12 },
      { type: "brake", icon: "▼", right: 12, bottom: 12 }
    ];

    for (const def of buttonDefs) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `control-button ${def.type}`;
      btn.textContent = def.icon;
      btn.style.position = "absolute";

      if (def.left !== undefined) btn.style.left = `${def.left}px`;
      if (def.right !== undefined) btn.style.right = `${def.right}px`;
      if (def.top !== undefined) btn.style.top = `${def.top}px`;
      if (def.bottom !== undefined) btn.style.bottom = `${def.bottom}px`;

      const setPressed = (pressed) => {
        btn.classList.toggle("active", pressed);
        const car = state.cars.find(c => c.isPlayer && c.playerIndex === i);
        if (car) car.control[def.type] = pressed;
      };

      btn.addEventListener("pointerdown", e => {
        e.preventDefault();
        setPressed(true);
      });
      btn.addEventListener("pointerup", () => setPressed(false));
      btn.addEventListener("pointerleave", () => setPressed(false));
      btn.addEventListener("pointercancel", () => setPressed(false));
      wrap.appendChild(btn);
    }

    controlsLayer.appendChild(wrap);
  }
}

function generateRace(playerCount) {
  const playerCars = [];
  const aiCars = [];
  const laneXs = [180, 330, 500, 670, 860];

  for (let i = 0; i < playerCount; i++) {
    const x = laneXs[i % laneXs.length] + (i > 3 ? 40 : 0);
    const y = 120 + i * 90;
    playerCars.push(createCar({
      id: i + 1,
      x,
      y,
      angle: -Math.PI / 2,
      isPlayer: true,
      playerIndex: i
    }));
  }

  const copilotIndex = playerCount + 1;
  aiCars.push(createCar({
    id: copilotIndex,
    x: laneXs[1] + 12,
    y: 220,
    angle: -Math.PI / 2,
    isPlayer: false,
    playerIndex: 0,
    labelOverride: "Copilot",
    colorOverride: "#7ef9ff"
  }));

  for (let i = 0; i < 12 - playerCount - 1; i++) {
    const x = laneXs[(i + playerCount + 1) % laneXs.length] + rand(-16, 16);
    const y = 150 + (i + playerCount + 1) * 90;
    aiCars.push(createCar({
      id: playerCount + i + 2,
      x,
      y,
      angle: -Math.PI / 2,
      isPlayer: false,
      playerIndex: 0
    }));
  }

  return [...playerCars, ...aiCars];
}

function startRace(playerCount) {
  state.mode = playerCount;
  state.started = true;
  state.raceEnded = false;
  state.countdown = 3;
  state.cars = generateRace(playerCount);
  state.players = state.cars.filter(c => c.isPlayer);
  state.winner = null;
  startScreen.classList.add("hidden");
  clearControls();
  buildControls(playerCount);
}

function keyIsDown(key) {
  return !!(window.__keys && window.__keys[key]);
}

window.addEventListener("keydown", e => {
  if (!window.__keys) window.__keys = {};
  window.__keys[e.key] = true;
});

window.addEventListener("keyup", e => {
  if (!window.__keys) window.__keys = {};
  window.__keys[e.key] = false;
});

function updateCar(car, dt) {
  if (!car.alive) return;

  if (car.isPlayer) {
    if (car.control.left) car.steer -= 2.2 * dt * 60;
    if (car.control.right) car.steer += 2.2 * dt * 60;
    if (car.control.accel) car.speed += car.accel * dt;
    if (car.control.brake) car.speed -= car.brake * dt;
  } else {
    const drift = Math.sin((performance.now() * 0.001 + car.id) * 2.0);
    const isCopilotBoost = car.isCopilot;
    if (isCopilotBoost) {
      car.steer = drift * 0.9;
      car.speed += car.accel * dt * 1.3;
    } else {
      car.steer = drift * 0.8;
      car.speed += car.accel * dt * 0.9;
    }
  }

  car.steer *= 0.9;
  car.steer = clamp(car.steer, -1.5, 1.5);

  car.angle += car.steer * dt * 60;
  car.speed *= car.friction;
  car.speed = clamp(car.speed, 0, car.maxSpeed);

  const dx = Math.cos(car.angle) * car.speed * dt * 0.7;
  const dy = Math.sin(car.angle) * car.speed * dt * 0.7;

  car.x += dx * 12;
  car.y += dy * 12;

  car.x = clamp(car.x, 80, WORLD.width - 80);
  car.y = clamp(car.y, 0, WORLD.finishY + 100);

  car.distance = Math.max(car.distance, car.y - 120);
}

function updateRace(dt) {
  if (!state.started || state.raceEnded) return;

  state.countdown -= dt;
  if (state.countdown > 0) return;

  for (const car of state.cars) {
    updateCar(car, dt);
  }

  for (const car of state.cars) {
    if (car.y >= WORLD.finishY) {
      state.raceEnded = true;
      state.winner = car;
      break;
    }
  }

  if (state.raceEnded) {
    state.cars.sort((a, b) => b.y - a.y);
    state.players.sort((a, b) => b.y - a.y);
  }
}

function handleKeyboard() {
  if (!state.started || state.raceEnded) return;

  for (let i = 0; i < state.players.length; i++) {
    const player = state.players[i];
    const map = playerKeyMap[i] || playerKeyMap[0];

    player.control.left = keyIsDown(map.left);
    player.control.right = keyIsDown(map.right);
    player.control.accel = keyIsDown(map.accel);
    player.control.brake = keyIsDown(map.brake);
  }
}

function drawViewport(rect, index) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  ctx.fillStyle = "#1a2332";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  const roadCenterX = rect.x + rect.w / 2;
  ctx.fillStyle = "#7b8188";
  ctx.fillRect(roadCenterX - 220, rect.y, 440, rect.h);

  for (let i = 1; i < 4; i++) {
    const laneX = roadCenterX - 150 + i * 100;
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.setLineDash([18, 18]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(laneX, rect.y);
    ctx.lineTo(laneX, rect.y + rect.h);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (const car of state.cars) {
    const px = (car.x - 500) + rect.w / 2 + rect.x;
    const py = (car.y - 2200) + rect.h / 2 + rect.y;

    if (px < rect.x - 80 || px > rect.x + rect.w + 80) continue;
    if (py < rect.y - 80 || py > rect.y + rect.h + 80) continue;

    drawCar(px, py, car);
  }

  if (state.started) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(rect.x + 10, rect.y + 10, 120, 28);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px Arial";
    ctx.fillText(`Player ${index + 1}`, rect.x + 16, rect.y + 28);
  }

  if (state.raceEnded) {
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(rect.x + 20, rect.y + 40, rect.w - 40, 160);

    ctx.fillStyle = "#ffd166";
    ctx.font = "bold 24px Arial";
    ctx.fillText("RACE OVER", rect.x + 40, rect.y + 70);

    const top3 = state.cars.slice(0, 3);
    for (let i = 0; i < top3.length; i++) {
      const car = top3[i];
      ctx.fillStyle = i === 0 ? "#ffd166" : "#ffffff";
      ctx.font = "16px Arial";
      ctx.fillText(`${i + 1}. ${car.label}`, rect.x + 40, rect.y + 100 + i * 25);
    }
  }

  ctx.restore();
}

function drawCar(px, py, car) {
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(car.angle);

  ctx.fillStyle = car.color;
  ctx.fillRect(-car.w / 2, -car.h / 2, car.w, car.h);

  ctx.fillStyle = "#171717";
  ctx.fillRect(-car.w / 2 + 8, -car.h / 2 + 10, car.w - 16, 26);

  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(-car.w / 2 + 10, -car.h / 2 + 12, 10, 12);
  ctx.fillRect(car.w / 2 - 20, -car.h / 2 + 12, 10, 12);

  ctx.restore();
}

function drawBackground() {
  ctx.fillStyle = "#0d1321";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const rects = getViewRects(state.mode);

  for (let i = 0; i < rects.length; i++) {
    drawViewport(rects[i], i);
  }
}

function drawCountdown() {
  if (!state.started || state.raceEnded) return;

  const t = Math.ceil(state.countdown);
  if (t > 0) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(canvas.width / 2 - 80, canvas.height / 2 - 60, 160, 100);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 60px Arial";
    ctx.textAlign = "center";
    ctx.fillText(String(t), canvas.width / 2, canvas.height / 2 + 20);
    ctx.textAlign = "left";
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  drawCountdown();
}

function loop(ts) {
  const dt = Math.min(0.033, (ts - state.lastTime) / 1000 || 0.016);
  state.lastTime = ts;

  handleKeyboard();
  updateRace(dt);
  render();

  requestAnimationFrame(loop);
}

document.querySelectorAll("[data-players]").forEach(button => {
  button.addEventListener("click", () => {
    const playerCount = Number(button.dataset.players);
    startRace(playerCount);
  });
});

requestAnimationFrame(loop);
