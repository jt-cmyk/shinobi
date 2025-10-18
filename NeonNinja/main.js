const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const GAME_WIDTH = canvas.width;
const GAME_HEIGHT = canvas.height;
const MAX_LIVES = 10;

const HUD = {
  score: document.getElementById("score"),
  lives: document.getElementById("lives"),
  wave: document.getElementById("wave"),
  multiplier: document.getElementById("multiplier"),
  powerUps: {
    killStar: {
      root: document.getElementById("boost-killstar"),
      timer: document.getElementById("boost-killstar-timer"),
    },
    rapidFire: {
      root: document.getElementById("boost-rapid"),
      timer: document.getElementById("boost-rapid-timer"),
    },
    slowMotion: {
      root: document.getElementById("boost-slow"),
      timer: document.getElementById("boost-slow-timer"),
    },
    phaseShift: {
      root: document.getElementById("boost-phase"),
      timer: document.getElementById("boost-phase-timer"),
    },
  },
};

const ASSET_SOURCES = {
  background: "assets/background.png",
  playerIdle: "assets/player_idle.png",
  playerThrow: "assets/player_kastepose.png",
  playerIdleFlipped: "assets/player_idle_flipped.png",
  playerThrowFlipped: "assets/player_kastepose_flipped.png",
  enemyIdle: "assets/enemy_idle.png",
  enemyThrow: "assets/enemy_kastepose.png",
  enemyIdleFlipped: "assets/enemy_idle_flipped.png",
  enemyThrowFlipped: "assets/enemy_kastepose_flipped.png",
  bossIdle: "assets/red_ninja_idle.png",
  bossThrow: "assets/red_ninja_kastepose.png",
  bossIdleFlipped: "assets/red_ninja_idle_flipped.png",
  bossThrowFlipped: "assets/red_ninja_kastepose_flipped.png",
  shuriken: "assets/shuriken.png",
};

const assets = {};

const POWER_UP_TYPES = ["killCharge", "rapidFire", "slowMotion", "phaseShift"];
const BOOST_SETTINGS = {
  killStar: { duration: 20 },
  rapidFire: { duration: 8 },
  slowMotion: { duration: 6, enemyFactor: 0.6, projectileFactor: 0.55 },
  phaseShift: { duration: 4, speedMultiplier: 1.35 },
};
const KILLSTAR_ANNOUNCE_DURATION = 1;
const SCORE_MULTIPLIER_DURATION = 12;
const POWER_UP_FALL_SPEED = 28;
const POWER_UP_TTL = 8;
const STREAK_DROP_THRESHOLD = 10;
const UFO_HEIGHT = 30;
const UFO_SPEED = 140;
const POWER_UP_COLORS = {
  killCharge: { core: "#ffffff", glow: "rgba(255, 46, 205, 0.85)" },
  rapidFire: { core: "#ffffff", glow: "rgba(40, 247, 255, 0.8)" },
  slowMotion: { core: "#ffffff", glow: "rgba(255, 212, 72, 0.8)" },
  phaseShift: { core: "#ffffff", glow: "rgba(157, 255, 106, 0.8)" },
};

// Simple state container for keyboard input.
const keyboard = new Map();
window.addEventListener("keydown", (event) => {
  const { code } = event;

  if ((code === "Enter" || code === "Space") && gameState.status === "ready") {
    event.preventDefault();
    beginGame();
    return;
  }

  if (code === "Enter" && gameState.status === "gameover") {
    event.preventDefault();
    resetGame();
    beginGame();
    return;
  }

  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(code)) {
    event.preventDefault();
  }

  keyboard.set(code, true);
});
window.addEventListener("keyup", (event) => {
  keyboard.set(event.code, false);
});

// Keeps runtime clock consistent across browsers.
let lastTimestamp = 0;

const gameState = {
  status: "loading",
  score: 0,
  lives: 3,
  wave: 1,
  backgroundPattern: null,
  player: null,
  enemies: [],
  projectiles: [],
  effects: [],
  enemyDirection: 1,
  enemySpeed: 14,
  enemyAdvanceTimer: 0,
  playerInvulnerable: 0,
  waveClearTimer: 0,
  isBossWave: false,
  powerUps: [],
  activeBoosts: {
    killStar: 0,
    rapidFire: 0,
    slowMotion: 0,
    phaseShift: 0,
  },
  killStarStacks: 0,
  killStreak: 0,
  scoreMultiplier: 1,
  scoreMultiplierTimer: 0,
  ufo: null,
  ufoSpawnedThisWave: false,
  nextUfoTimer: 0,
  killStarAnnouncementTimer: 0,
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function loadAssets() {
  const entries = Object.entries(ASSET_SOURCES);
  await Promise.all(
    entries.map(async ([key, value]) => {
      assets[key] = await loadImage(value);
    }),
  );
}

function createBackgroundPattern(image) {
  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = GAME_WIDTH;
  patternCanvas.height = GAME_HEIGHT;
  const patternCtx = patternCanvas.getContext("2d");
  patternCtx.drawImage(image, 0, 0, patternCanvas.width, patternCanvas.height);
  return ctx.createPattern(patternCanvas, "repeat");
}

function initPlayer() {
  return {
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT - 28,
    width: 28,
    height: 28,
    speed: 140,
    facing: 1,
    pose: "idle",
    poseTimer: 0,
    fireCooldown: 0,
    hitBoxRadius: 10,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatSeconds(value) {
  return `${Math.max(0, value).toFixed(1)}s`;
}

function updatePlayer(player, dt) {
  let moved = false;
  const moveSpeed = player.speed * getPlayerSpeedMultiplier();
  if (keyboard.get("ArrowLeft") || keyboard.get("KeyA")) {
    player.x -= moveSpeed * dt;
    player.facing = -1;
    moved = true;
  }
  if (keyboard.get("ArrowRight") || keyboard.get("KeyD")) {
    player.x += moveSpeed * dt;
    player.facing = 1;
    moved = true;
  }
  player.x = clamp(player.x, 16, GAME_WIDTH - 16);

  if (moved) {
    player.pose = "idle";
  }

  if (player.poseTimer > 0) {
    player.poseTimer -= dt;
    if (player.poseTimer <= 0) {
      player.pose = "idle";
    }
  }

  if (player.fireCooldown > 0) {
    player.fireCooldown -= dt;
    if (isBoostActive("rapidFire")) {
      player.fireCooldown = Math.max(0, Math.min(player.fireCooldown, getPlayerFireDelay()));
    }
  }

  const wantsToFire =
    keyboard.get("Space") || keyboard.get("KeyK") || keyboard.get("KeyZ");
  if (wantsToFire && player.fireCooldown <= 0) {
    spawnPlayerProjectile(player);
    player.pose = "throw";
    player.poseTimer = 0.2;
    player.fireCooldown = getPlayerFireDelay();
  }
}

function spawnPlayerProjectile(player) {
  const baseProjectile = {
    x: player.x,
    y: player.y - 20,
    vx: 0,
    vy: -240,
    owner: "player",
    rotation: 0,
    hitRadius: 8,
  };
  gameState.projectiles.push({ ...baseProjectile });

  if (isBoostActive("killStar")) {
    const spreadSpeed = 120;
    gameState.projectiles.push({
      ...baseProjectile,
      vx: -spreadSpeed,
      rotation: baseProjectile.rotation,
    });
    gameState.projectiles.push({
      ...baseProjectile,
      vx: spreadSpeed,
      rotation: baseProjectile.rotation,
    });
  }
}

function spawnEnemyProjectile(enemy, config = {}) {
  const speed = 70 + gameState.wave * 8;
  gameState.projectiles.push({
    x: enemy.x + (config.offsetX ?? 0),
    y: enemy.y + (config.offsetY ?? 16),
    vx: config.vx ?? 0,
    vy: config.vy ?? speed,
    owner: "enemy",
    rotation: 0,
    hitRadius: config.hitRadius ?? 9,
  });
}

function spawnBossProjectiles(enemy) {
  const baseSpeed = 90 + gameState.wave * 6;
  const spread = 70 + gameState.wave * 3;
  const offsets = [
    { vx: -spread, vy: baseSpeed },
    { vx: 0, vy: baseSpeed * 0.9 },
    { vx: spread, vy: baseSpeed },
  ];
  for (const projectile of offsets) {
    spawnEnemyProjectile(enemy, {
      vx: projectile.vx,
      vy: projectile.vy,
      offsetY: 20,
      hitRadius: 11,
    });
  }
}

function updateProjectiles(dt) {
  for (const projectile of gameState.projectiles) {
    const projectileFactor = getEnemyProjectileFactor(projectile.owner);
    projectile.x += projectile.vx * dt * projectileFactor;
    projectile.y += projectile.vy * dt * projectileFactor;
    projectile.rotation += 10 * dt;
  }
  gameState.projectiles = gameState.projectiles.filter(
    (p) => !p.dead && p.y > -20 && p.y < GAME_HEIGHT + 20,
  );
}

function getAdvanceDelay() {
  return clamp(2.6 - gameState.wave * 0.1, 1.6, 2.6);
}

function getInitialFireCooldown(wave) {
  return clamp(5.2 - wave * 0.25, 2.5, 5.2);
}

function getRefireCooldown(wave) {
  return clamp(3.6 - wave * 0.15, 1.6, 3.6);
}

function getEnemyFireChance(wave) {
  return clamp(0.08 + wave * 0.02, 0.08, 0.35);
}

function isBoostActive(name) {
  return (gameState.activeBoosts[name] ?? 0) > 0;
}

function getEnemyTimeFactor() {
  return isBoostActive("slowMotion") ? BOOST_SETTINGS.slowMotion.enemyFactor : 1;
}

function getEnemyProjectileFactor(projectileOwner) {
  if (projectileOwner === "enemy" && isBoostActive("slowMotion")) {
    return BOOST_SETTINGS.slowMotion.projectileFactor;
  }
  return 1;
}

function getPlayerSpeedMultiplier() {
  return isBoostActive("phaseShift") ? BOOST_SETTINGS.phaseShift.speedMultiplier : 1;
}

function getPlayerFireDelay() {
  return isBoostActive("rapidFire") ? 0.22 : 0.35;
}

function activateScoreMultiplier(duration = SCORE_MULTIPLIER_DURATION) {
  gameState.scoreMultiplier = 2;
  gameState.scoreMultiplierTimer = Math.max(gameState.scoreMultiplierTimer, duration);
  spawnExplosion(gameState.player ? gameState.player.x : GAME_WIDTH / 2, 70, "wave");
}

function addScore(amount) {
  gameState.score += Math.round(amount * gameState.scoreMultiplier);
}

function spawnWave(wave) {
  const isBossWave = wave % 5 === 0;
  gameState.isBossWave = isBossWave;

  if (isBossWave) {
    const baseHealth = 16 + Math.max(0, wave - 5) * 2;
    const speed = 22 + wave * 2;
    gameState.enemies = [
      {
        type: "boss",
        x: GAME_WIDTH / 2,
        y: 46,
        baseY: 46,
        width: 44,
        height: 44,
        facing: 1,
        pose: "idle",
        poseTimer: 0,
        fireCooldown: 2.4,
        sweepTimer: 0,
        hitRadius: 20,
        health: baseHealth,
        maxHealth: baseHealth,
        speed,
        direction: 1,
      },
    ];
    gameState.enemyDirection = 1;
    gameState.enemySpeed = speed;
    gameState.enemyAdvanceTimer = 0;
    scheduleUfo();
    return;
  }

  const rows = 3;
  const cols = 7;
  const paddingX = 36;
  const paddingY = 26;
  const offsetX = 36;
  const offsetY = 22;
  const baseCooldown = getInitialFireCooldown(wave);

  const enemies = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      enemies.push({
        type: "grunt",
        x: offsetX + col * paddingX,
        y: offsetY + row * paddingY,
        width: 26,
        height: 26,
        facing: 1,
        pose: "idle",
        poseTimer: 0,
        fireCooldown: baseCooldown * (0.7 + Math.random() * 0.6),
        speedMultiplier: 1 + row * 0.1,
        hitRadius: 12,
      });
    }
  }

  gameState.enemies = enemies;
  gameState.enemyDirection = 1;
  gameState.enemySpeed = 12 + wave * 1.8;
  gameState.enemyAdvanceTimer = getAdvanceDelay();
  scheduleUfo();
}

function scheduleUfo() {
  gameState.ufo = null;
  gameState.ufoSpawnedThisWave = false;
  gameState.nextUfoTimer = 5 + Math.random() * 7;
}

function updateEnemies(dt) {
  if (gameState.enemies.length === 0) {
    return;
  }

  if (gameState.isBossWave) {
    const boss = gameState.enemies.find((enemy) => !enemy.dead);
    if (!boss) {
      gameState.enemies = [];
      return;
    }

    const timeFactor = getEnemyTimeFactor();
    boss.sweepTimer += dt * timeFactor;
    boss.x += boss.direction * boss.speed * dt * timeFactor;
    if (boss.x < 32) {
      boss.x = 32;
      boss.direction = 1;
    } else if (boss.x > GAME_WIDTH - 32) {
      boss.x = GAME_WIDTH - 32;
      boss.direction = -1;
    }

    boss.facing = boss.direction >= 0 ? 1 : -1;
    boss.y = boss.baseY + Math.sin(boss.sweepTimer * 1.6) * 14;

    if (boss.poseTimer > 0) {
      boss.poseTimer -= dt * timeFactor;
      if (boss.poseTimer <= 0) {
        boss.pose = "idle";
      }
    }

    boss.fireCooldown -= dt * timeFactor;
    if (boss.fireCooldown <= 0) {
      spawnBossProjectiles(boss);
      boss.pose = "throw";
      boss.poseTimer = 0.45;
      boss.fireCooldown = Math.max(1.5, 2.6 - gameState.wave * 0.12);
    }

    return;
  }

  let shouldDescend = false;
  const reachedBottom = [];
  for (const enemy of gameState.enemies) {
    const speedMultiplier = enemy.speedMultiplier ?? 1;
    const timeFactor = getEnemyTimeFactor();
    enemy.x += gameState.enemyDirection * gameState.enemySpeed * speedMultiplier * dt * timeFactor;

    if (
      (gameState.enemyDirection === -1 && enemy.x < 24) ||
      (gameState.enemyDirection === 1 && enemy.x > GAME_WIDTH - 24)
    ) {
      shouldDescend = true;
    }

    if (enemy.poseTimer > 0) {
      enemy.poseTimer -= dt * timeFactor;
      if (enemy.poseTimer <= 0) {
        enemy.pose = "idle";
      }
    }

    enemy.fireCooldown -= dt * timeFactor;
    if (enemy.fireCooldown <= 0 && Math.random() < getEnemyFireChance(gameState.wave)) {
      spawnEnemyProjectile(enemy);
      enemy.pose = "throw";
      enemy.poseTimer = 0.4;
      enemy.fireCooldown = getRefireCooldown(gameState.wave) * (0.7 + Math.random() * 0.6);
    }

    if (enemy.y + enemy.height / 2 >= GAME_HEIGHT - 28) {
      reachedBottom.push(enemy);
    }
  }

  if (shouldDescend) {
    gameState.enemyDirection *= -1;
    const dropDistance = 10;
    for (const enemy of gameState.enemies) {
      enemy.y += dropDistance;
      enemy.facing = gameState.enemyDirection;
    }
  }

  gameState.enemyAdvanceTimer -= dt * getEnemyTimeFactor();
  if (gameState.enemyAdvanceTimer <= 0) {
    for (const enemy of gameState.enemies) {
      enemy.y += 4;
    }
    gameState.enemyAdvanceTimer = getAdvanceDelay();
  }

  if (reachedBottom.length > 0) {
    for (const enemy of reachedBottom) {
      enemy.dead = true;
      spawnExplosion(enemy.x, enemy.y, "enemy");
      hitPlayer(enemy.x, enemy.y);
    }
  }
}

function drawBackground() {
  if (gameState.backgroundPattern) {
    ctx.fillStyle = gameState.backgroundPattern;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  } else if (assets.background) {
    ctx.drawImage(assets.background, 0, 0, GAME_WIDTH, GAME_HEIGHT);
  } else {
    ctx.fillStyle = "#05060b";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }
}

function drawPlayer(player) {
  const sprite =
    player.pose === "throw"
      ? player.facing === 1
        ? assets.playerThrow
        : assets.playerThrowFlipped
      : player.facing === 1
        ? assets.playerIdle
        : assets.playerIdleFlipped;
  const isBlinking = gameState.playerInvulnerable > 0 && Math.floor(gameState.playerInvulnerable * 20) % 2 === 0;
  if (isBlinking) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    drawSprite(sprite, player.x, player.y, 32, 32);
    ctx.restore();
  } else {
    drawSprite(sprite, player.x, player.y, 32, 32);
  }
}

function drawSprite(image, x, y, width, height) {
  ctx.drawImage(image, x - width / 2, y - height / 2, width, height);
}

function drawProjectiles() {
  for (const projectile of gameState.projectiles) {
    ctx.save();
    ctx.translate(projectile.x, projectile.y);
    ctx.rotate(projectile.rotation);
    ctx.drawImage(assets.shuriken, -10, -10, 20, 20);
    ctx.restore();
  }
}

function drawEnemies() {
  for (const enemy of gameState.enemies) {
    if (enemy.dead) {
      continue;
    }
    if (enemy.type === "boss") {
      const sprite =
        enemy.pose === "throw"
          ? enemy.facing === 1
            ? assets.bossThrow
            : assets.bossThrowFlipped
          : enemy.facing === 1
            ? assets.bossIdle
            : assets.bossIdleFlipped;
      drawSprite(sprite, enemy.x, enemy.y, 56, 56);
      drawBossHealthBar(enemy);
    } else {
      const sprite =
        enemy.pose === "throw"
          ? enemy.facing === 1
            ? assets.enemyThrow
            : assets.enemyThrowFlipped
          : enemy.facing === 1
            ? assets.enemyIdle
            : assets.enemyIdleFlipped;
      drawSprite(sprite, enemy.x, enemy.y, 30, 30);
    }
  }
}

function drawBossHealthBar(enemy) {
  const barWidth = 160;
  const barHeight = 10;
  const x = GAME_WIDTH / 2 - barWidth / 2;
  const y = 12;
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(x - 4, y - 4, barWidth + 8, barHeight + 8);
  ctx.strokeStyle = "rgba(255, 46, 205, 0.7)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 4, y - 4, barWidth + 8, barHeight + 8);

  ctx.fillStyle = "rgba(40, 247, 255, 0.35)";
  ctx.fillRect(x, y, barWidth, barHeight);

  const healthRatio = clamp(enemy.health / enemy.maxHealth, 0, 1);
  const gradient = ctx.createLinearGradient(x, y, x + barWidth, y);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.9)");
  gradient.addColorStop(0.5, "rgba(255, 46, 205, 0.9)");
  gradient.addColorStop(1, "rgba(40, 247, 255, 0.9)");
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, barWidth * healthRatio, barHeight);

  ctx.font = "9px 'Press Start 2P', monospace";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText("BOSS", GAME_WIDTH / 2, y + barHeight + 12);
  ctx.restore();
}

function spawnPowerUp(type, x, y) {
  const chosen = type ?? POWER_UP_TYPES[Math.floor(Math.random() * POWER_UP_TYPES.length)];
  gameState.powerUps.push({
    type: chosen,
    x,
    y,
    vy: POWER_UP_FALL_SPEED,
    ttl: POWER_UP_TTL,
    pulse: 0,
  });
}

function updatePowerUps(dt) {
  for (const powerUp of gameState.powerUps) {
    powerUp.y += powerUp.vy * dt;
    powerUp.ttl -= dt;
    powerUp.pulse += dt;
  }
  gameState.powerUps = gameState.powerUps.filter(
    (powerUp) => powerUp.ttl > 0 && powerUp.y < GAME_HEIGHT - 18 && !powerUp.collected,
  );
}

function drawPowerUps() {
  for (const powerUp of gameState.powerUps) {
    const palette = POWER_UP_COLORS[powerUp.type] ?? { core: "#ffffff", glow: "rgba(255,255,255,0.8)" };
    const radius = 6 + Math.sin(powerUp.pulse * 6) * 1.5;
    ctx.save();
    ctx.translate(powerUp.x, powerUp.y);
    ctx.beginPath();
    ctx.fillStyle = palette.glow;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.9;
    ctx.arc(0, 0, radius + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.fillStyle = palette.core;
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "8px 'Press Start 2P', monospace";
    ctx.fillStyle = palette.glow;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const glyph =
      powerUp.type === "slowMotion"
        ? "S"
        : powerUp.type === "rapidFire"
          ? "R"
          : powerUp.type === "phaseShift"
            ? "P"
            : "K";
    ctx.fillText(glyph, 0, 0);
    ctx.restore();
  }
}

function collectPowerUps() {
  if (!gameState.player) {
    return;
  }
  const collected = [];
  for (const powerUp of gameState.powerUps) {
    const dx = powerUp.x - gameState.player.x;
    const dy = powerUp.y - gameState.player.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq <= (16 + gameState.player.hitBoxRadius) ** 2) {
      applyPowerUp(powerUp.type);
      powerUp.collected = true;
      collected.push(powerUp);
      spawnExplosion(powerUp.x, powerUp.y, "wave");
    }
  }
  if (collected.length > 0) {
    gameState.powerUps = gameState.powerUps.filter((powerUp) => !collected.includes(powerUp));
  }
}

function applyPowerUp(type) {
  if (type === "killCharge") {
    gameState.killStarStacks = clamp(gameState.killStarStacks + 1, 0, 3);
    if (gameState.killStarStacks >= 3) {
      gameState.killStarStacks = 0;
      triggerKillStar();
    }
    return;
  }
  if (!BOOST_SETTINGS[type]) {
    return;
  }
  gameState.activeBoosts[type] = BOOST_SETTINGS[type].duration;
  if (type === "phaseShift") {
    gameState.playerInvulnerable = Math.max(gameState.playerInvulnerable, BOOST_SETTINGS.phaseShift.duration);
  }
}

function triggerKillStar() {
  gameState.activeBoosts.killStar = BOOST_SETTINGS.killStar.duration;
  gameState.killStarAnnouncementTimer = KILLSTAR_ANNOUNCE_DURATION;
  gameState.playerInvulnerable = Math.max(gameState.playerInvulnerable, 1);
  spawnExplosion(gameState.player ? gameState.player.x : GAME_WIDTH / 2, gameState.player ? gameState.player.y : GAME_HEIGHT - 40, "wave");
}

function updateBoostTimers(dt) {
  for (const key of Object.keys(gameState.activeBoosts)) {
    if (gameState.activeBoosts[key] > 0) {
      gameState.activeBoosts[key] = Math.max(0, gameState.activeBoosts[key] - dt);
    }
  }
  if (gameState.scoreMultiplierTimer > 0) {
    gameState.scoreMultiplierTimer -= dt;
    if (gameState.scoreMultiplierTimer <= 0) {
      gameState.scoreMultiplier = 1;
      gameState.scoreMultiplierTimer = 0;
    }
  }
}

function maybeDropPowerUp(enemy, { streakTriggered = false, wasBoss = false } = {}) {
  let shouldDrop = false;
  const waveFactor = clamp(0.08 + gameState.wave * 0.008, 0.08, 0.3);
  if (wasBoss) {
    shouldDrop = Math.random() < 0.7;
  } else if (streakTriggered) {
    shouldDrop = true;
  } else {
    shouldDrop = Math.random() < waveFactor;
  }

  if (shouldDrop) {
    const randomType = POWER_UP_TYPES[Math.floor(Math.random() * POWER_UP_TYPES.length)];
    spawnPowerUp(randomType, enemy.x, enemy.y);
    gameState.killStreak = 0;
  }
}

function spawnUfo() {
  const fromLeft = Math.random() < 0.5;
  gameState.ufo = {
    x: fromLeft ? -18 : GAME_WIDTH + 18,
    y: UFO_HEIGHT,
    vx: fromLeft ? UFO_SPEED : -UFO_SPEED,
    width: 16,
    height: 7,
    hitRadius: 7,
  };
  gameState.ufoSpawnedThisWave = true;
}

function updateUfo(dt) {
  if (gameState.status !== "running") {
    return;
  }

  if (!gameState.ufo && !gameState.ufoSpawnedThisWave) {
    gameState.nextUfoTimer -= dt;
    if (gameState.nextUfoTimer <= 0) {
      spawnUfo();
    }
  }

  if (gameState.ufo) {
    const factor = getEnemyTimeFactor();
    gameState.ufo.x += gameState.ufo.vx * dt * factor;
    if (
      (gameState.ufo.vx > 0 && gameState.ufo.x > GAME_WIDTH + 40) ||
      (gameState.ufo.vx < 0 && gameState.ufo.x < -40)
    ) {
      gameState.ufo = null;
    }
  }
}

function drawUfo() {
  if (!gameState.ufo) {
    return;
  }
  const ufo = gameState.ufo;
  ctx.save();
  ctx.translate(ufo.x, ufo.y);
  ctx.fillStyle = "rgba(40, 247, 255, 0.75)";
  ctx.beginPath();
  ctx.ellipse(0, 0, ufo.width, ufo.height, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 46, 205, 0.85)";
  ctx.beginPath();
  ctx.ellipse(0, -ufo.height / 4, ufo.width * 0.65, ufo.height * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-3, -ufo.height / 2, 6, 2.5);
  ctx.restore();
}

function spawnExplosion(x, y, palette = "enemy") {
  const palettes = {
    enemy: {
      radius: 32,
      life: 0.35,
      stops: [
        { pos: 0, color: "rgba(255, 255, 255, 0.85)" },
        { pos: 0.4, color: "rgba(255, 46, 205, 0.65)" },
        { pos: 1, color: "rgba(255, 46, 205, 0)" },
      ],
    },
    player: {
      radius: 36,
      life: 0.5,
      stops: [
        { pos: 0, color: "rgba(255, 255, 255, 0.75)" },
        { pos: 0.5, color: "rgba(40, 247, 255, 0.6)" },
        { pos: 1, color: "rgba(40, 247, 255, 0)" },
      ],
    },
    wave: {
      radius: 80,
      life: 0.8,
      stops: [
        { pos: 0, color: "rgba(255, 255, 255, 0.55)" },
        { pos: 0.6, color: "rgba(255, 46, 205, 0.35)" },
        { pos: 1, color: "rgba(40, 247, 255, 0)" },
      ],
    },
    boss: {
      radius: 56,
      life: 0.55,
      stops: [
        { pos: 0, color: "rgba(255, 255, 255, 0.9)" },
        { pos: 0.5, color: "rgba(255, 80, 48, 0.75)" },
        { pos: 1, color: "rgba(255, 80, 48, 0)" },
      ],
    },
  };

  const config = palettes[palette] ?? palettes.enemy;
  gameState.effects.push({
    x,
    y,
    elapsed: 0,
    life: config.life,
    maxRadius: config.radius,
    stops: config.stops,
  });
}

function updateEffects(dt) {
  for (const effect of gameState.effects) {
    effect.elapsed += dt;
  }
  gameState.effects = gameState.effects.filter((effect) => effect.elapsed < effect.life);
}

function drawEffects() {
  for (const effect of gameState.effects) {
    const progress = clamp(effect.elapsed / effect.life, 0, 1);
    const radius = Math.max(6, effect.maxRadius * progress);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.max(0, 1 - progress);
    const gradient = ctx.createRadialGradient(effect.x, effect.y, 0, effect.x, effect.y, radius);
    for (const stop of effect.stops) {
      gradient.addColorStop(stop.pos, stop.color);
    }
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function handleCollisions() {
  const player = gameState.player;
  if (!player) {
    return;
  }
  const playerProjectiles = gameState.projectiles.filter((p) => p.owner === "player");
  const enemyProjectiles = gameState.projectiles.filter((p) => p.owner === "enemy");

  for (const projectile of playerProjectiles) {
    if (projectile.dead) {
      continue;
    }
    for (const enemy of gameState.enemies) {
      if (enemy.dead) {
        continue;
      }
      if (circlesCollide(projectile.x, projectile.y, projectile.hitRadius, enemy.x, enemy.y, enemy.hitRadius)) {
        projectile.dead = true;
        let enemyDefeated = false;
        if (enemy.type === "boss") {
          enemy.health -= 1;
          addScore(150);
          const defeated = enemy.health <= 0;
          spawnExplosion(enemy.x, enemy.y, defeated ? "boss" : "enemy");
          if (defeated) {
            enemy.dead = true;
            addScore(2000 + gameState.wave * 40);
            enemyDefeated = true;
          }
        } else {
          enemy.dead = true;
          addScore(100 + gameState.wave * 15);
          spawnExplosion(enemy.x, enemy.y, "enemy");
          enemyDefeated = true;
        }

        if (enemyDefeated) {
          gameState.killStreak += 1;
          const wasBoss = enemy.type === "boss";
          const streakTriggered = !wasBoss && gameState.killStreak >= STREAK_DROP_THRESHOLD;
          maybeDropPowerUp(enemy, { streakTriggered, wasBoss });
          if (wasBoss) {
            gameState.killStreak = 0;
          }
        }
        break;
      }
    }

    if (!projectile.dead && gameState.ufo) {
      const ufo = gameState.ufo;
      if (circlesCollide(projectile.x, projectile.y, projectile.hitRadius, ufo.x, ufo.y, ufo.hitRadius)) {
        projectile.dead = true;
        addScore(500);
        activateScoreMultiplier();
        spawnExplosion(ufo.x, ufo.y, "wave");
        gameState.ufo = null;
      }
    }
  }

  gameState.enemies = gameState.enemies.filter((enemy) => !enemy.dead);

  if (gameState.playerInvulnerable <= 0) {
    for (const projectile of enemyProjectiles) {
      if (
        circlesCollide(
          projectile.x,
          projectile.y,
          projectile.hitRadius,
          player.x,
          player.y,
          player.hitBoxRadius,
        )
      ) {
        projectile.dead = true;
        hitPlayer(projectile.x, projectile.y);
        break;
      }
    }
  }
}

function circlesCollide(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const distanceSq = dx * dx + dy * dy;
  const radius = ar + br;
  return distanceSq <= radius * radius;
}

function hitPlayer(x, y) {
  if (gameState.playerInvulnerable > 0 || gameState.status !== "running") {
    return;
  }
  gameState.lives -= 1;
  gameState.playerInvulnerable = 1.6;
  spawnExplosion(x ?? gameState.player.x, y ?? gameState.player.y, "player");
  if (gameState.player) {
    gameState.player.x = GAME_WIDTH / 2;
    gameState.player.pose = "idle";
    gameState.player.poseTimer = 0;
    gameState.player.fireCooldown = 0;
  }
  gameState.killStreak = 0;
  if (gameState.lives <= 0) {
    gameState.status = "gameover";
    keyboard.clear();
  }
  updateHUD();
}

function drawOverlay() {
  drawKillStarBanner();
  if (gameState.status === "ready") {
    drawMessage("Neon Ninja", "Press Enter to play");
    return;
  }
  if (gameState.status === "gameover") {
    drawMessage("GAME OVER", "Press Enter to play again");
  } else if (gameState.enemies.length === 0 && gameState.waveClearTimer > 0) {
    const subtitle = gameState.lives >= MAX_LIVES ? "Life already maxed" : "+1 Life";
    drawMessage(`Wave ${gameState.wave} cleared!`, subtitle);
  }
}

function drawKillStarBanner() {
  const remaining = gameState.killStarAnnouncementTimer;
  if (remaining <= 0) {
    return;
  }
  const duration = KILLSTAR_ANNOUNCE_DURATION;
  const progress = 1 - remaining / duration;
  const fadeIn = clamp(progress / 0.2, 0, 1);
  const fadeOut = clamp(remaining / 0.2, 0, 1);
  const alpha = Math.min(fadeIn, fadeOut);

  ctx.save();
  ctx.globalAlpha = alpha;
  const bannerHeight = 42;
  const bannerY = 48;
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillRect(0, bannerY - bannerHeight / 2, GAME_WIDTH, bannerHeight);

  ctx.font = "22px 'Press Start 2P', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(255, 46, 205, 0.9)";
  ctx.shadowBlur = 24;
  ctx.fillStyle = "rgba(40, 247, 255, 0.95)";
  ctx.fillText("KILLSTAR", GAME_WIDTH / 2, bannerY);
  ctx.shadowColor = "rgba(40, 247, 255, 0.9)";
  ctx.shadowBlur = 10;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
  ctx.lineWidth = 1.5;
  ctx.strokeText("KILLSTAR", GAME_WIDTH / 2, bannerY);
  ctx.restore();
}

function drawMessage(title, subtitle) {
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(40, 48, GAME_WIDTH - 80, 84);
  ctx.strokeStyle = "rgba(255, 46, 205, 0.6)";
  ctx.strokeRect(40, 48, GAME_WIDTH - 80, 84);

  ctx.font = "16px 'Press Start 2P', monospace";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, GAME_WIDTH / 2, 84);

  ctx.font = "10px 'Press Start 2P', monospace";
  ctx.fillStyle = "rgba(40, 247, 255, 0.9)";
  ctx.fillText(subtitle, GAME_WIDTH / 2, 120);
  ctx.restore();
}

function resetGame() {
  gameState.score = 0;
  gameState.lives = 3;
  gameState.wave = 1;
  gameState.projectiles = [];
  gameState.effects = [];
  gameState.powerUps = [];
  gameState.waveClearTimer = 0;
  gameState.enemyDirection = 1;
  gameState.enemySpeed = 14;
  gameState.isBossWave = false;
  gameState.playerInvulnerable = 0;
  gameState.killStreak = 0;
  gameState.scoreMultiplier = 1;
  gameState.scoreMultiplierTimer = 0;
  gameState.ufo = null;
  gameState.ufoSpawnedThisWave = false;
  gameState.nextUfoTimer = 0;
  gameState.killStarStacks = 0;
  gameState.killStarAnnouncementTimer = 0;
  for (const key of Object.keys(gameState.activeBoosts)) {
    gameState.activeBoosts[key] = 0;
  }
  gameState.player = initPlayer();
  spawnWave(gameState.wave);
  gameState.status = "ready";
  keyboard.clear();
  updateHUD();
}

function beginGame() {
  if (gameState.status !== "ready") {
    return;
  }
  gameState.status = "running";
  gameState.waveClearTimer = 0;
  gameState.playerInvulnerable = 0;
  if (gameState.player) {
    gameState.player.pose = "idle";
    gameState.player.poseTimer = 0;
    gameState.player.fireCooldown = 0;
  }
  keyboard.clear();
  updateHUD();
}

function updateHUD() {
  HUD.score.textContent = gameState.score.toString().padStart(6, "0");
  HUD.lives.textContent = gameState.lives.toString().padStart(2, "0");
  HUD.wave.textContent = gameState.wave.toString().padStart(2, "0");
  if (HUD.multiplier) {
    if (gameState.scoreMultiplier > 1) {
      HUD.multiplier.textContent = `×${gameState.scoreMultiplier}`;
      HUD.multiplier.classList.remove("hidden");
    } else {
      HUD.multiplier.classList.add("hidden");
    }
  }
  if (HUD.powerUps) {
    for (const [key, slot] of Object.entries(HUD.powerUps)) {
      if (!slot.root || !slot.timer) {
        continue;
      }
      const remaining = gameState.activeBoosts[key] ?? 0;
      if (key === "killStar") {
        if (remaining > 0.05) {
          slot.root.classList.add("active");
          slot.timer.textContent = formatSeconds(remaining);
        } else {
          if (gameState.killStarStacks > 0) {
            slot.root.classList.add("active");
            slot.timer.textContent = `Fragments ${gameState.killStarStacks}/3`;
          } else {
            slot.root.classList.remove("active");
            slot.timer.textContent = "Fragments 0/3";
          }
        }
        continue;
      }
      if (remaining > 0.05) {
        slot.root.classList.add("active");
        slot.timer.textContent = formatSeconds(remaining);
      } else {
        slot.root.classList.remove("active");
        slot.timer.textContent = "0.0s";
      }
    }
  }
}

function update(dt) {
  if (gameState.status === "loading" || gameState.status === "error") {
    return;
  }

  if (gameState.killStarAnnouncementTimer > 0) {
    gameState.killStarAnnouncementTimer = Math.max(0, gameState.killStarAnnouncementTimer - dt);
  }

  if (gameState.status === "gameover" || gameState.status === "ready") {
    updateEffects(dt);
    return;
  }

  if (gameState.playerInvulnerable > 0) {
    gameState.playerInvulnerable -= dt;
  }

  updatePlayer(gameState.player, dt);
  updateEnemies(dt);
  updateProjectiles(dt);
  updatePowerUps(dt);
  collectPowerUps();
  handleCollisions();
  updateEffects(dt);
  updateUfo(dt);
  updateBoostTimers(dt);

  if (gameState.enemies.length === 0 && gameState.waveClearTimer <= 0) {
    gameState.waveClearTimer = 1.5;
    spawnExplosion(GAME_WIDTH / 2, 60, "wave");
  }

  if (gameState.waveClearTimer > 0) {
    gameState.waveClearTimer -= dt;
    if (gameState.waveClearTimer <= 0) {
      if (gameState.lives < MAX_LIVES) {
        gameState.lives = Math.min(MAX_LIVES, gameState.lives + 1);
      }
      gameState.powerUps = [];
      gameState.ufo = null;
      gameState.ufoSpawnedThisWave = false;
      gameState.killStreak = 0;
      gameState.projectiles = [];
      gameState.wave += 1;
      spawnWave(gameState.wave);
      gameState.player.fireCooldown = 0;
      updateHUD();
    }
  }

  updateHUD();
}

function render() {
  drawBackground();
  drawEnemies();
  if (gameState.player) {
    drawPlayer(gameState.player);
  }
  drawPowerUps();
  drawProjectiles();
  drawUfo();
  drawEffects();
  drawOverlay();
}

function gameLoop(timestamp) {
  const dt = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;

  update(dt);
  render();

  requestAnimationFrame(gameLoop);
}

async function start() {
  try {
    await loadAssets();
    gameState.backgroundPattern = createBackgroundPattern(assets.background);
    gameState.player = initPlayer();
    spawnWave(gameState.wave);
    gameState.status = "ready";
    keyboard.clear();
    updateHUD();
    requestAnimationFrame((ts) => {
      lastTimestamp = ts;
      requestAnimationFrame(gameLoop);
    });
  } catch (error) {
    console.error("Kunne ikke loade assets:", error);
    gameState.status = "error";
  }
}

start();
