/*
 * Pixel Pac-Man Mouth Game with Mode Select (Refactored)
 * - Face Mode: ml5.js FaceMesh 입 벌림
 * - Button Mode: 1/3 키로 입 벌림/닫힘
 */

// ─────────────────────────── ASSETS & CONFIG ────────────────────────────

let font;
let frameImg;
let foodImages = [];
let ghostImages = [];
let lifeImage;
let plusImages = [];
let minusImages = [];

let sounds = {}; // To store all sound objects

const ASSET_PATHS = {
  font: "assets/Jersey10Regular.ttf",
  frame: "assets/frame.png",
  food: "assets/food?.png", // ? will be replaced by number
  ghost: "assets/ghost?.png",
  life: "assets/life.png",
  plus1: "assets/plus1.png",
  plus2: "assets/plus2.png",
  minus1: "assets/minus1.png",
  minus2: "assets/minus2.png",
  button1_3: "assets/button1_3.mp3",
  button2: "assets/button2.mp3",
  eat: "assets/food.mp3",
  ghostHit: "assets/ghost.mp3",
  lifeCollect: "assets/life.mp3",
  lose: "assets/lose2.mp3",
  stageBgm: "assets/stage.mp3",
};

const GAME_CONFIG = {
  SCREEN_WIDTH: 1280,
  SCREEN_HEIGHT: 720,
  ICON_SIZE: 64,
  PIXEL_RES: 16,
  PIXEL_SCALE: 10,
  BUTTON_MAX_ANGLE: Math.PI / 4,
  FACEMESH_CLOSE_THRESHOLD: 25,
  FACEMESH_MAX_OPEN_DISTANCE: 70,
  PACMAN_MAX_MOUTH_ANGLE: (3 * Math.PI) / 6,
  HUD_Y: 140,
  HUD_SPACING: 200,
  ANIM_PLUS_FRAMES: 4,
  ANIM_PLUS_FRAME_TIME: 5,
  ANIM_MINUS_FRAMES: 4,
  ANIM_MINUS_FRAME_TIME: 5,
  PARTICLE_LIFESPAN_DECREMENT: 5,
  PARTICLE_COUNT_ON_EAT: 10,
  ITEM_SPAWN_INTERVAL: 1000, // ms
  LIFE_ITEM_SCORE_THRESHOLD: 10,
  SPARKLE_BURSTS: 16,
  SPARKLE_DURATION_FRAMES: 30, // Approx 0.5 sec at 60fps
  MAX_FACES: 1,
  FACE_UPPER_LIP_INDICES: [61, 185, 40, 39, 37],
  FACE_LOWER_LIP_INDICES: [146, 91, 181, 84, 17],
  GHOST_SPEED_MULTIPLIER: 1.4,
  BASE_ITEM_SPEED_MIN: 2,
  BASE_ITEM_SPEED_MAX: 5,
};

GAME_CONFIG.SPARKLE_INTERVAL = GAME_CONFIG.SPARKLE_DURATION_FRAMES / GAME_CONFIG.SPARKLE_BURSTS;

const GAME_STATE = {
  MAIN_MENU: "main_menu",
  MODE_SELECT: "mode_select",
  PLAYING: "playing",
  GAME_OVER: "game_over",
};

const CONTROL_MODE = {
  FACE: "face",
  BUTTON: "button",
};

// ─────────────────────────── GLOBALish INSTANCES ────────────────────────
let video;
let faceMesh;
let faces = [];
let pixelCanvasGraphics; // For drawing the pixelated Pac-Man

let player;
let itemManager;
let animationManager;
let particleSystem;

let game = {
  score: 0,
  life: 3,
  currentGameState: GAME_STATE.MAIN_MENU,
  controlMode: null,
  nextLifeScore: GAME_CONFIG.LIFE_ITEM_SCORE_THRESHOLD,
  isButtonMouthOpen: false, // Specific to button mode
};

// ─────────────────────────── CLASSES ────────────────────────────────────

class Player {
  constructor(x, y, pixelRes, scale, pGraphics) {
    this.x = x;
    this.y = y;
    this.pixelRes = pixelRes;
    this.scale = scale;
    this.graphics = pGraphics; // The createGraphics() object
    this.angle = 0; // Pac-Man mouth angle
    this.displaySize = this.pixelRes * this.scale;

    // Sparkle effect state
    this.sparkleCount = 0;
    this.sparkleTimer = 0;
  }

  updateMouthAngle(newAngle) {
    this.angle = newAngle;
  }

  getMouthOpenState() {
    // This is the generic mouth open state based on angle, used by items.
    // For Face Mode, angle is > 0 if mouth is open.
    // For Button Mode, angle is either 0 or BUTTON_MAX_ANGLE.
    return this.angle > 0.01; // A small epsilon to avoid floating point issues for 0 angle
  }

  getBounds() {
    return {
      x: this.x,
      y: this.y,
      radius: this.displaySize / 2,
    };
  }

  startSparkles() {
    this.sparkleCount = GAME_CONFIG.SPARKLE_BURSTS;
    this.sparkleTimer = 0;
  }

  draw() {
    this.graphics.clear();
    this.graphics.fill(255, 204, 0); // Pac-Man yellow
    this.graphics.noStroke();
    this.graphics.arc(
      this.pixelRes / 2,
      this.pixelRes / 2,
      this.pixelRes,
      this.pixelRes,
      this.angle,
      TWO_PI - this.angle,
      PIE
    );

    // Sparkle animation on the pixelCanvas
    if (this.sparkleCount > 0) {
      if (this.sparkleTimer <= 0) {
        const nSparks = 4;
        this.graphics.fill(random(200, 255), random(200, 255), random(0, 100)); // Yellowish-white sparkles
        for (let i = 0; i < nSparks; i++) {
          const sx = floor(random(1, this.pixelRes - 1));
          const sy = floor(random(1, this.pixelRes - 1));
          this.graphics.square(sx, sy, 1); // Smaller sparkles on pixel art
        }
        this.sparkleCount--;
        this.sparkleTimer = GAME_CONFIG.SPARKLE_INTERVAL;
      } else {
        this.sparkleTimer--;
      }
    }

    image(
      this.graphics,
      this.x - this.displaySize / 2,
      this.y - this.displaySize / 2,
      this.displaySize,
      this.displaySize
    );
  }
}

class Item {
  constructor(x, y, speed, type, imgArray, imgIndex = 0) {
    this.x = x;
    this.y = y;
    this.speed = speed;
    this.type = type;
    this.imgArray = imgArray;
    this.imgIndex = imgIndex;
    this.iconSize = GAME_CONFIG.ICON_SIZE;
  }

  update() {
    this.x -= this.speed;
  }

  draw() {
    const currentImage = this.imgArray[this.imgIndex];
    if (currentImage) {
      image(
        currentImage,
        this.x - this.iconSize / 2,
        this.y - this.iconSize / 2,
        this.iconSize,
        this.iconSize
      );
    }
  }

  isOffScreen() {
    return this.x < -this.iconSize;
  }

  checkCollision(playerBounds) {
    return dist(playerBounds.x, playerBounds.y, this.x, this.y) < playerBounds.radius + this.iconSize / 3; // Adjusted collision radius
  }

  applyEffect(gameContext) { /* To be overridden by subclasses */ }
}

class FoodItem extends Item {
  constructor(x, y, speed, imgIndex) {
    super(x, y, speed, "food", foodImages, imgIndex);
  }
  applyEffect(ctx) { // ctx is the gameContext
    if (ctx.player.getMouthOpenState()) {
      playSound(sounds.eat);
      ctx.animationManager.triggerPlusAnimation("score");
      ctx.game.score++;
      ctx.particleSystem.createBurst(this.x, this.y, color(255, 204, 0), GAME_CONFIG.PARTICLE_COUNT_ON_EAT);
    } else {
      playSound(ctx.sounds.reversedEat, 0.5);
      ctx.animationManager.triggerMinusAnimation("life");
      ctx.game.life--;
      ctx.particleSystem.createBurst(this.x, this.y, color(207, 12, 12), GAME_CONFIG.PARTICLE_COUNT_ON_EAT);
    }
  }
}

class GhostItem extends Item {
  constructor(x, y, speed, imgIndex) {
    super(x, y, speed, "ghost", ghostImages, imgIndex);
  }
  applyEffect(ctx) {
    if (ctx.player.getMouthOpenState()) {
      ctx.game.currentGameState = GAME_STATE.GAME_OVER; // Game over
    } else {
      playSound(sounds.ghostHit, 0.5);
      ctx.animationManager.triggerPlusAnimation("score");
      ctx.game.score++;
      ctx.particleSystem.createBurst(this.x, this.y, color(74, 144, 226), GAME_CONFIG.PARTICLE_COUNT_ON_EAT);
    }
  }
}

class LifeUpItem extends Item {
  constructor(x, y, speed) {
    super(x, y, speed, "life", [lifeImage]); // lifeImage is a single image, wrap in array
  }
  applyEffect(ctx) {
    if (ctx.player.getMouthOpenState()) {
      playSound(sounds.lifeCollect, 0.5);
      ctx.animationManager.triggerPlusAnimation("life");
      ctx.game.life++;
      ctx.player.startSparkles();
    }
  }
}

class ItemManager {
  constructor() {
    this.items = [];
    this.nextGhostIndex = 0;
    this.spawnIntervalId = null;
  }

  startSpawning() {
    if (this.spawnIntervalId) clearInterval(this.spawnIntervalId);
    this.spawnIntervalId = setInterval(() => this.spawnItem(), GAME_CONFIG.ITEM_SPAWN_INTERVAL);
  }

  stopSpawning() {
    if (this.spawnIntervalId) clearInterval(this.spawnIntervalId);
    this.spawnIntervalId = null;
  }

  spawnItem() {
    if (game.currentGameState !== GAME_STATE.PLAYING) return;

    const y = height / 2; // Items spawn in the middle vertically
    const r = random();
    let newItem;
    const baseSpeed = random(GAME_CONFIG.BASE_ITEM_SPEED_MIN, GAME_CONFIG.BASE_ITEM_SPEED_MAX);

    if (r < 0.65) { // Food
      const imgIndex = floor(random(foodImages.length));
      newItem = new FoodItem(width + GAME_CONFIG.ICON_SIZE, y, baseSpeed, imgIndex);
    } else { // Ghost
      const imgIndex = this.nextGhostIndex;
      this.nextGhostIndex = (this.nextGhostIndex + 1) % ghostImages.length;
      const speed = baseSpeed * GAME_CONFIG.GHOST_SPEED_MULTIPLIER;
      newItem = new GhostItem(width + GAME_CONFIG.ICON_SIZE, y, speed, imgIndex);
    }
    this.items.push(newItem);
  }

  spawnLifeUpItem() {
    if (game.currentGameState !== GAME_STATE.PLAYING) return;
    playSound(sounds.reversedLife, 0.5); // Sound cue for life item appearing
    const y = height / 2;
    const speed = random(GAME_CONFIG.BASE_ITEM_SPEED_MIN, GAME_CONFIG.BASE_ITEM_SPEED_MAX);
    this.items.push(new LifeUpItem(width + GAME_CONFIG.ICON_SIZE, y, speed));
  }

  updateAndDraw(playerInstance, gameContext) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      let item = this.items[i];
      item.update();
      item.draw();

      if (item.isOffScreen()) {
        this.items.splice(i, 1);
        continue;
      }

      if (item.checkCollision(playerInstance.getBounds())) {
        item.applyEffect(gameContext);
        this.items.splice(i, 1);
        // If game over is triggered by an item, we might want to stop processing more items.
        if (game.currentGameState === GAME_STATE.GAME_OVER) break;
      }
    }
  }
  reset() {
    this.items = [];
    this.nextGhostIndex = 0;
    this.stopSpawning();
  }
}

class EffectAnimation {
  constructor(images, x, y, frameTime, totalFrames) {
    this.images = images;
    this.x = x;
    this.y = y;
    this.iconSize = GAME_CONFIG.ICON_SIZE;
    this.frameIdx = 0;
    this.timer = frameTime;
    this.frameTime = frameTime;
    this.totalFrames = totalFrames; // Total animation ticks, not image indices
    this.finished = false;
  }

  update() {
    if (this.finished) return;
    this.timer--;
    if (this.timer <= 0) {
      this.frameIdx++;
      this.timer = this.frameTime;
    }
    if (this.frameIdx >= this.totalFrames) {
      this.finished = true;
    }
  }

  draw() {
    if (this.finished) return;
    const currentImage = this.images[this.frameIdx % this.images.length];
    image(currentImage, this.x, this.y, this.iconSize, this.iconSize);
  }
}

class AnimationManager {
  constructor() {
    this.animations = [];
  }

  triggerPlusAnimation(type) { // type is 'score' or 'life'
    const hudInfo = getHUDPositions();
    const targetX = (type === 'score' ? hudInfo.scoreTextEndPos.x : hudInfo.lifeTextEndPos.x) + 10;
    const targetY = hudInfo.y - GAME_CONFIG.ICON_SIZE / 2;
    this.animations.push(
      new EffectAnimation(plusImages, targetX, targetY, GAME_CONFIG.ANIM_PLUS_FRAME_TIME, GAME_CONFIG.ANIM_PLUS_FRAMES)
    );
  }

  triggerMinusAnimation(type) {
    const hudInfo = getHUDPositions();
    const targetX = (type === 'score' ? hudInfo.scoreTextEndPos.x : hudInfo.lifeTextEndPos.x) + 10;
    const targetY = hudInfo.y - GAME_CONFIG.ICON_SIZE / 2;
    this.animations.push(
      new EffectAnimation(minusImages, targetX, targetY, GAME_CONFIG.ANIM_MINUS_FRAME_TIME, GAME_CONFIG.ANIM_MINUS_FRAMES)
    );
  }

  updateAndDraw() {
    for (let i = this.animations.length - 1; i >= 0; i--) {
      const anim = this.animations[i];
      anim.update();
      if (anim.finished) {
        this.animations.splice(i, 1);
      } else {
        anim.draw();
      }
    }
  }
  reset() {
    this.animations = [];
  }
}

class Particle {
  constructor(x, y, col) {
    this.pos = createVector(x, y);
    this.vel = p5.Vector.random2D().mult(random(1, 4));
    this.acc = createVector(0, 0.1); // Gravity
    this.lifespan = 255;
    this.col = col;
    this.size = random(8, 16);
  }
  update() {
    this.vel.add(this.acc);
    this.pos.add(this.vel);
    this.lifespan -= GAME_CONFIG.PARTICLE_LIFESPAN_DECREMENT;
  }
  draw() {
    noStroke();
    fill(red(this.col), green(this.col), blue(this.col), this.lifespan);
    rectMode(CENTER);
    rect(this.pos.x, this.pos.y, this.size, this.size);
    rectMode(CORNER); // Reset rectMode
  }
  isDead() {
    return this.lifespan <= 0;
  }
}

class ParticleSystem {
  constructor() {
    this.particles = [];
  }
  add(x, y, color) {
    this.particles.push(new Particle(x, y, color));
  }
  createBurst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      this.particles.push(new Particle(x, y, color));
    }
  }
  updateAndDraw() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      let p = this.particles[i];
      p.update();
      p.draw();
      if (p.isDead()) {
        this.particles.splice(i, 1);
      }
    }
  }
  reset() {
    this.particles = [];
  }
}


// ─────────────────────────── P5.JS MAIN FUNCTIONS ─────────────────────

function preload() {
  font = loadFont(ASSET_PATHS.font);
  frameImg = loadImage(ASSET_PATHS.frame);

  for (let i = 1; i <= 4; i++) {
    foodImages.push(loadImage(ASSET_PATHS.food.replace('?', i)));
    ghostImages.push(loadImage(ASSET_PATHS.ghost.replace('?', i)));
  }
  lifeImage = loadImage(ASSET_PATHS.life);

  plusImages.push(loadImage(ASSET_PATHS.plus1));
  plusImages.push(loadImage(ASSET_PATHS.plus2));
  minusImages.push(loadImage(ASSET_PATHS.minus1));
  minusImages.push(loadImage(ASSET_PATHS.minus2));

  sounds.button1_3 = loadSound(ASSET_PATHS.button1_3);
  sounds.button2 = loadSound(ASSET_PATHS.button2);
  sounds.eat = loadSound(ASSET_PATHS.eat);
  sounds.reversedEat = loadSound(ASSET_PATHS.eat, () => sounds.reversedEat.reverseBuffer());
  sounds.ghostHit = loadSound(ASSET_PATHS.ghostHit);
  sounds.lifeCollect = loadSound(ASSET_PATHS.lifeCollect);
  sounds.reversedLife = loadSound(ASSET_PATHS.lifeCollect, () => sounds.reversedLife.reverseBuffer());
  sounds.lose = loadSound(ASSET_PATHS.lose);
  sounds.stageBgm = loadSound(ASSET_PATHS.stageBgm);

  faceMesh = ml5.faceMesh({ maxFaces: GAME_CONFIG.MAX_FACES, refineLandmarks: true, flipHorizontal: false });
}

function setup() {
  createCanvas(GAME_CONFIG.SCREEN_WIDTH, GAME_CONFIG.SCREEN_HEIGHT);
  textFont(font);
  noSmooth(); // For pixel art style

  cameraAvailable = false; // 기본값 false
  
  // 카메라 초기화 시도
  try {
    video = createCapture(VIDEO);
    video.size(width, height);
    video.hide();
    
    // 카메라가 성공적으로 생성되면 true로 설정
    if (video) {
      cameraAvailable = true;
      console.log('카메라 초기화 성공');
    }
  } catch (error) {
    console.log('카메라 초기화 실패:', error);
    cameraAvailable = false;
    video = null;
  }

  pixelCanvasGraphics = createGraphics(GAME_CONFIG.PIXEL_RES, GAME_CONFIG.PIXEL_RES);
  pixelCanvasGraphics.noSmooth();

  // Initialize game objects
  player = new Player(width / 4, height / 2, GAME_CONFIG.PIXEL_RES, GAME_CONFIG.PIXEL_SCALE, pixelCanvasGraphics);
  itemManager = new ItemManager();
  animationManager = new AnimationManager();
  particleSystem = new ParticleSystem();

  game.currentGameState = GAME_STATE.MAIN_MENU;
}

function videoReady() {
  console.log('카메라 초기화 성공');
}

function videoError() {
  console.log('카메라 접근 실패');
  video = null;
}

function draw() {
  background(0);

  switch (game.currentGameState) {
    case GAME_STATE.MAIN_MENU:
      drawMainMenuScreen();
      break;
    case GAME_STATE.MODE_SELECT:
      drawModeSelectScreen();
      break;
    case GAME_STATE.PLAYING:
      drawPlayingScreen();
      break;
    case GAME_STATE.GAME_OVER:
      drawGameOverScreen();
      break;
  }
  image(frameImg, 0, 0, width, height); // Overlay frame
}

function keyPressed() {
  switch (game.currentGameState) {
    case GAME_STATE.MAIN_MENU:
      handleMainMenuInput();
      break;
    case GAME_STATE.MODE_SELECT:
      handleModeSelectInput();
      break;
    case GAME_STATE.PLAYING:
      handlePlayingInput();
      break;
    case GAME_STATE.GAME_OVER:
      handleGameOverInput();
      break;
  }
}

// ─────────────────────────── GAME STATE SCREENS & INPUT ────────────────

function checkCameraStatus() {
  if (video && video.elt && video.elt.videoWidth > 0 && video.elt.videoHeight > 0) {
    return true; // 실제 비디오 스트림이 있음
  }
  return false; // 비디오 스트림이 없음
}

function drawMainMenuScreen() {

  const actualCameraWorking = checkCameraStatus();
  
  textAlign(CENTER, CENTER);
  fill(255, 204, 0);
  textSize(200);
  text("PAC-BOY", width / 2, height / 3);
  
  fill(255);
  textSize(60);
  text("Press 2 to Start", width / 2, height * 0.65);
  
  fill(200);
  textSize(35);
  if (!actualCameraWorking) {
    fill(255, 100, 100);
    textSize(40);
    text("Camera Not Available - Button Mode Only", width / 2, height * 0.75);
  } else {
    fill(100, 255, 100); 
    textSize(40);
    text("Camera Ready - All Modes Available", width / 2, height * 0.75);
  }
}

function handleMainMenuInput() {
  if (key === "2") {
    playSound(sounds.button2, 0.5);
    game.currentGameState = GAME_STATE.MODE_SELECT;
  }
}

let selectedModeIndex = 0; // Keep track of selection in mode select
const modes = ["Face Mode", "Button Mode"];

function drawModeSelectScreen() {

  const actualCameraWorking = checkCameraStatus();

  textAlign(CENTER, CENTER);
  fill(255);
  textSize(80);
  text("MODE SELECT", width / 2, height * 0.2);

  if (!actualCameraWorking) {
    // 카메라가 없을 때: Button Mode만 표시
    fill(255);
    textSize(56);
    text("In-game Rule:", width / 2, height / 3);
    textSize(48);
    text("Press 1 to open, 3 to close the mouth", width / 2, height / 2 - 50);
    
    // Button Mode를 중앙에 표시
    fill(255, 204, 0);
    textSize(48);
    text("Button Mode", width / 2, height / 1.8);
    
    fill(255);
    textSize(32);
    text("Press 2 to Start", width / 2, height * 0.75);
    
  } else {
    // 카메라가 있을 때: 기존 코드 (두 모드 선택 가능)
    const rules = [
      "Open your mouth to control Pac-Boy",
      "Press 1 to open, 3 to close the mouth",
    ];
    textSize(56);
    fill(255);
    text("In-game Rule:", width / 2, height / 3);
    textSize(48);
    text(rules[selectedModeIndex], width / 2, height / 2 - 50);

    for (let i = 0; i < modes.length; i++) {
      textSize(48);
      if (i === selectedModeIndex) fill(255, 204, 0);
      else fill(200);
      text(modes[i], width / 2 + (i - 0.5) * (width / 4), height / 1.8);
    }

    fill(255);
    textSize(32);
    text("Press 1 / 3 to Select Mode, Press 2 to Start", width / 2, height * 0.75);
  }
}

function handleModeSelectInput() {
  
  const actualCameraWorking = checkCameraStatus();

  if (!actualCameraWorking) {
    // 카메라가 없을 때는 2번 키만 동작 (Button Mode로 바로 시작)
    if (key === "2") {
      playSound(sounds.button2, 0.5);
      game.controlMode = CONTROL_MODE.BUTTON;
      resetAndStartGame();
    }
  } else {
    // 카메라가 있을 때는 기존 로직
    if (key === "1") {
      playSound(sounds.button1_3, 0.5);
      selectedModeIndex = max(0, selectedModeIndex - 1);
    } else if (key === "3") {
      playSound(sounds.button1_3, 0.5);
      selectedModeIndex = min(modes.length - 1, selectedModeIndex + 1);
    } else if (key === "2") {
      playSound(sounds.button2, 0.5);
      game.controlMode = modes[selectedModeIndex] === "Face Mode" ? CONTROL_MODE.FACE : CONTROL_MODE.BUTTON;
      resetAndStartGame();
    }
  }
}

function drawPlayingScreen() {
  image(video, 0, 0, width, height); // Draw webcam feed

  let pacmanAngle = computePacmanAngle();
  player.updateMouthAngle(pacmanAngle);
  player.draw();

  const gameContext = { game, player, itemManager, animationManager, particleSystem, sounds };
  itemManager.updateAndDraw(player, gameContext);

  drawHUD();
  animationManager.updateAndDraw();
  particleSystem.updateAndDraw();

  // Check for life item spawn
  if (game.score >= game.nextLifeScore) {
    itemManager.spawnLifeUpItem();
    game.nextLifeScore += GAME_CONFIG.LIFE_ITEM_SCORE_THRESHOLD;
  }

  // Check for game over by life
  if (game.life <= 0 && game.currentGameState === GAME_STATE.PLAYING) {
    game.currentGameState = GAME_STATE.GAME_OVER;
  }
  // Transition to GAME_OVER state is handled by item effects or life check
  if (game.currentGameState === GAME_STATE.GAME_OVER) {
    if (sounds.stageBgm && sounds.stageBgm.isPlaying()) {
      sounds.stageBgm.stop();
    }
    playSound(sounds.lose, 0.5);
    itemManager.stopSpawning();
    if (game.controlMode === CONTROL_MODE.FACE) {
      faceMesh.detectStop();
    }
  }
}

function handlePlayingInput() {
  if (game.controlMode === CONTROL_MODE.BUTTON) {
    if (key === "1") {
      game.isButtonMouthOpen = true;
    }
    if (key === "3") {
      game.isButtonMouthOpen = false;
    }
  }
}

function drawGameOverScreen() {
  // Stop BGM and play lose sound handled when state transitions in drawPlayingScreen
  background(0, 150); // Semi-transparent background
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(100);
  text("GAME OVER", width / 2, height / 2 - 60);
  textSize(50);
  text(`Final Score: ${game.score}`, width / 2, height / 2 + 30);
  textSize(30);
  fill(200);
  text("Press 2 to return to Menu", width / 2, height / 2 + 100);
}

function handleGameOverInput() {
  if (key === "2") {
    playSound(sounds.button2, 0.5);
    game.currentGameState = GAME_STATE.MAIN_MENU; // Or MODE_SELECT
    // Resetting game variables will happen in resetAndStartGame or a similar function
    // if we go directly to MODE_SELECT and then start.
    // For now, main menu is fine, selection will trigger reset.
  }
}


// ─────────────────────────── HELPER FUNCTIONS ─────────────────────────

function playSound(soundObj, volume = 1.0, rate = 1.0) {
  if (soundObj && soundObj.isLoaded()) {
    soundObj.setVolume(volume);
    soundObj.rate(rate);
    soundObj.play();
  }
}

function resetAndStartGame() {
  game.score = 0;
  game.life = 3;
  game.isButtonMouthOpen = false;
  game.nextLifeScore = GAME_CONFIG.LIFE_ITEM_SCORE_THRESHOLD;

  player.angle = 0; // Reset Pac-Man's mouth
  player.sparkleCount = 0; // Reset sparkles

  itemManager.reset();
  animationManager.reset();
  particleSystem.reset();

  if (game.controlMode === CONTROL_MODE.FACE && (!video || !cameraAvailable)) {
    console.log('카메라를 사용할 수 없어 Button Mode로 자동 전환합니다.');
    game.controlMode = CONTROL_MODE.BUTTON;
  }

  if (game.controlMode === CONTROL_MODE.FACE && video && cameraAvailable) {
    faceMesh.detectStart(video, (_results) => { faces = _results; });
  } else {
    // Button Mode이거나 카메라가 없는 경우
    if (faceMesh) {
      faceMesh.detectStop();
    }
  }

  itemManager.startSpawning();
  if (sounds.stageBgm) {
    sounds.stageBgm.setVolume(0.3);
    sounds.stageBgm.loop();
  }
  game.currentGameState = GAME_STATE.PLAYING;
}

function computePacmanAngle() {
  if (game.controlMode === CONTROL_MODE.BUTTON) {
    return game.isButtonMouthOpen ? GAME_CONFIG.BUTTON_MAX_ANGLE : 0;
  }
  // Face Mode
  let angle = 0;
  if (faces.length > 0 && faces[0].keypoints) {
    const k = faces[0].keypoints;
    const upperYs = GAME_CONFIG.FACE_UPPER_LIP_INDICES.map((i) => k[i].y);
    const lowerYs = GAME_CONFIG.FACE_LOWER_LIP_INDICES.map((i) => k[i].y);
    const avgUpperY = upperYs.reduce((a, b) => a + b, 0) / upperYs.length;
    const avgLowerY = lowerYs.reduce((a, b) => a + b, 0) / lowerYs.length;
    const mouthOpenDistance = avgLowerY - avgUpperY;

    if (mouthOpenDistance > GAME_CONFIG.FACEMESH_CLOSE_THRESHOLD) {
      angle = map(
        mouthOpenDistance,
        GAME_CONFIG.FACEMESH_CLOSE_THRESHOLD,
        GAME_CONFIG.FACEMESH_MAX_OPEN_DISTANCE,
        0,
        GAME_CONFIG.PACMAN_MAX_MOUTH_ANGLE,
        true // Constrain
      );
    }
  }
  return angle;
}

function getHUDPositions() {
  const centerX = width / 2;
  const scoreX = centerX - GAME_CONFIG.HUD_SPACING;
  const lifeX = centerX + GAME_CONFIG.HUD_SPACING;
  const scoreStr = `Score: ${game.score}`;
  const lifeStr = `Life:  ${game.life}`; // Extra space for alignment
  return {
    y: GAME_CONFIG.HUD_Y,
    scorePos: { x: scoreX, y: GAME_CONFIG.HUD_Y },
    lifePos: { x: lifeX, y: GAME_CONFIG.HUD_Y },
    scoreTextEndPos: { x: scoreX + textWidth(scoreStr) / 2, y: GAME_CONFIG.HUD_Y },
    lifeTextEndPos: { x: lifeX + textWidth(lifeStr) / 2, y: GAME_CONFIG.HUD_Y }
  };
}

function drawHUD() {
  const hud = getHUDPositions();

  textAlign(CENTER, CENTER);
  textSize(64);
  fill(255);

  text(`Score: ${game.score}`, hud.scorePos.x, hud.scorePos.y);
  text(`Life:  ${game.life}`, hud.lifePos.x, hud.lifePos.y); // Extra space for alignment
}

// (Original gotFaces can be simplified as it's used in detectStart callback)
// function gotFaces(results) { faces = results; } // Not strictly needed if using anonymous in detectStart
