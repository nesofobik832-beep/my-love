const $ = (s) => document.querySelector(s);

const screens = {
  start: $("#startScreen"),
  game: $("#gameScreen"),
  box: $("#boxScreen"),
  letter: $("#letterScreen")
};

const world = $("#world");
const playerEl = $("#player");
const heartsLayer = $("#heartsLayer");
const catsLayer = $("#catsLayer");
const boxEl = $("#box");
const countEl = $("#heartCount");
const livesEl = $("#lives");
const messageEl = $("#message");
const damageFlash = $("#damageFlash");
const joystick = $("#joystick");
const knob = joystick.querySelector(".joystick-knob");

const TOTAL_HEARTS = 12;
let hearts = [];
let cats = [];
let collected = 0;
let lives = 3;
let gameRunning = false;
let lastTime = 0;
let invulnerableUntil = 0;
let joystickPointer = null;
let input = { x: 0, y: 0 };

// Игрок быстрый и послушный
const player = {
  x: 0, y: 0,
  r: 16, // уменьшен радиус коллизии для честности
  speed: 210,
  facingLeft: false
};

function show(screen){
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screen.classList.add("active");
}

function resizeWorld(){
  const rect = world.getBoundingClientRect();
  if (!player.x) {
    player.x = rect.width * 0.50;
    player.y = rect.height * 0.78;
  }
}

function setPlayer(){
  playerEl.style.left = player.x + "px";
  playerEl.style.top = player.y + "px";
  const scaleX = player.facingLeft ? -1 : 1;
  playerEl.querySelector("img").style.transform = `scaleX(${scaleX})`;
}

function random(min, max){ return Math.random() * (max - min) + min; }
function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
function distance(a, b){ return Math.hypot(a.x - b.x, a.y - b.y); }

function message(text){
  messageEl.textContent = text;
  messageEl.classList.add("show");
  setTimeout(() => messageEl.classList.remove("show"), 1200);
}

function createHeart(x, y){
  const el = document.createElement("div");
  el.className = "heart";
  el.innerHTML = '<img src="assets/heart.png" alt="">';
  el.style.left = x + "px";
  el.style.top = y + "px";
  heartsLayer.appendChild(el);
  return { x, y, r: 24, el };
}

function createCat(x, y, index){
  const el = document.createElement("div");
  el.className = "cat";
  el.innerHTML = `<img src="assets/cat${(index % 3) + 1}.png" alt="">`;
  el.style.left = x + "px";
  el.style.top = y + "px";
  catsLayer.appendChild(el);

  return {
    x, y,
    vx: 0, vy: 0,
    r: 18, // маленький хитбокс котика
    el,
    speed: 65 + index * 8, // ОЧЕНЬ медленные котики (в 3 раза медленнее игрока)
    wanderTarget: { x, y },
    nextWanderTime: 0
  };
}

// Красивое равномерное распределение сердечек по полянке
function spawnBalancedHearts(w, h){
  const marginX = w * 0.12;
  const marginTop = h * 0.15;
  const marginBottom = h * 0.20;

  const usableW = w - marginX * 2;
  const usableH = h - marginTop - marginBottom;

  const cols = 3;
  const rows = 4;
  const cellW = usableW / cols;
  const cellH = usableH / rows;

  for(let r = 0; r < rows; r++){
    for(let c = 0; c < cols; c++){
      const centerX = marginX + (c + 0.5) * cellW;
      const centerY = marginTop + (r + 0.5) * cellH;

      let x = centerX + random(-cellW * 0.28, cellW * 0.28);
      let y = centerY + random(-cellH * 0.28, cellH * 0.28);

      // Не спавнить под ногами на старте
      if(distance({x, y}, player) < 120){
        y -= cellH * 0.5;
      }

      hearts.push(createHeart(x, y));
    }
  }
}

function startGame(){
  show(screens.game);
  collected = 0;
  lives = 3;
  hearts = [];
  cats = [];
  countEl.textContent = "0";
  livesEl.textContent = "♡ ♡ ♡";
  heartsLayer.innerHTML = "";
  catsLayer.innerHTML = "";
  boxEl.classList.add("hidden");
  gameRunning = true;
  resizeWorld();

  const rect = world.getBoundingClientRect();
  player.x = rect.width * 0.50;
  player.y = rect.height * 0.78;
  player.facingLeft = false;
  setPlayer();

  spawnBalancedHearts(rect.width, rect.height);

  // Котики начинают вверху поляны
  const catSpawns = [
    { x: rect.width * 0.20, y: rect.height * 0.22 },
    { x: rect.width * 0.50, y: rect.height * 0.18 },
    { x: rect.width * 0.80, y: rect.height * 0.22 }
  ];
  cats = catSpawns.map((p, i) => createCat(p.x, p.y, i));

  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function collectHeart(i){
  const h = hearts[i];
  if(!h) return;
  h.el.remove();
  hearts.splice(i, 1);
  collected++;
  countEl.textContent = collected;
  message("Сердечко найдено ♡");
  if(navigator.vibrate) navigator.vibrate(20);

  if(collected === TOTAL_HEARTS){
    gameRunning = false;
    setTimeout(() => show(screens.box), 700);
  }
}

function hitByCat(){
  const now = performance.now();
  if(now < invulnerableUntil) return;

  lives--;
  // 2 секунды полной безопасности после удара
  invulnerableUntil = now + 2000;
  damageFlash.classList.remove("hit");
  void damageFlash.offsetWidth;
  damageFlash.classList.add("hit");
  livesEl.textContent = "♡ ".repeat(lives).trim();

  if(navigator.vibrate) navigator.vibrate([50, 40, 50]);

  if(lives <= 0){
    gameRunning = false;
    message("Котик замурчал тебя... Давай ещё разок ♡");
    setTimeout(startGame, 1000);
  } else {
    message("Ой! Котик потёрся о ножки");
    const rect = world.getBoundingClientRect();
    player.x = rect.width * 0.50;
    player.y = rect.height * 0.78;
    setPlayer();
  }
}

// === ЛЕНИВЫЙ И МИЛЫЙ ИИ КОТИКОВ ===
function updateCats(dt, now){
  const w = world.clientWidth;
  const h = world.clientHeight;

  cats.forEach(cat => {
    const d = distance(cat, player);
    let targetX, targetY;

    // Котик обращает внимание на игрока ТОЛЬКО если подойти совсем близко (меньше 160px)
    if (d < 160) {
      targetX = player.x;
      targetY = player.y;
    } else {
      // В остальное время котик неторопливо гуляет сам по себе
      if (now > cat.nextWanderTime) {
        cat.wanderTarget = {
          x: random(w * 0.15, w * 0.85),
          y: random(h * 0.18, h * 0.75)
        };
        cat.nextWanderTime = now + random(2500, 5000); // меняет направление раз в 3-5 сек
      }
      targetX = cat.wanderTarget.x;
      targetY = cat.wanderTarget.y;
    }

    const dx = targetX - cat.x;
    const dy = targetY - cat.y;
    const len = Math.hypot(dx, dy) || 1;

    let desiredVx = (dx / len) * cat.speed;
    let desiredVy = (dy / len) * cat.speed;

    // Плавное медленное движение
    cat.vx += (desiredVx - cat.vx) * Math.min(dt * 3, 1);
    cat.vy += (desiredVy - cat.vy) * Math.min(dt * 3, 1);

    cat.x += cat.vx * dt;
    cat.y += cat.vy * dt;

    cat.x = clamp(cat.x, 30, w - 30);
    cat.y = clamp(cat.y, 80, h - 50);

    cat.el.style.left = cat.x + "px";
    cat.el.style.top = cat.y + "px";

    // Поворот взгляда котика
    if (Math.abs(cat.vx) > 3) {
      cat.el.querySelector("img").style.transform = `scaleX(${cat.vx < 0 ? -1 : 1})`;
    }

    // Проверка столкновения (только при явном касании)
    if (d < cat.r + player.r) {
      hitByCat();
    }
  });
}

// === УПРАВЛЕНИЕ ИГРОКОМ ===
function updatePlayer(dt){
  if(!input.x && !input.y) return;

  const len = Math.hypot(input.x, input.y) || 1;
  player.x += (input.x / len) * player.speed * dt;
  player.y += (input.y / len) * player.speed * dt;

  if (input.x < -0.1) player.facingLeft = true;
  if (input.x > 0.1) player.facingLeft = false;

  const w = world.clientWidth;
  const h = world.clientHeight;
  player.x = clamp(player.x, 30, w - 30);
  player.y = clamp(player.y, 80, h - 45);

  setPlayer();
}

function checkHearts(){
  for(let i = hearts.length - 1; i >= 0; i--){
    // Сердечки собираются легко и с запасом
    if(distance(player, hearts[i]) < player.r + hearts[i].r + 10){
      collectHeart(i);
    }
  }
}

function loop(t){
  if(!gameRunning) return;
  const dt = Math.min((t - lastTime) / 1000, 0.035);
  lastTime = t;

  updatePlayer(dt);
  checkHearts();
  updateCats(dt, t);

  requestAnimationFrame(loop);
}

// === ДЖОЙСТИК И КНОПКИ ===
function setJoystick(clientX, clientY){
  const r = joystick.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  let dx = clientX - cx;
  let dy = clientY - cy;
  const max = r.width * 0.35;
  const len = Math.hypot(dx, dy);

  if (len > max) {
    dx = (dx / len) * max;
    dy = (dy / len) * max;
  }
  knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  input = { x: dx / max, y: dy / max };
}

function resetJoystick(){
  knob.style.transform = "translate(-50%, -50%)";
  input = { x: 0, y: 0 };
}

joystick.addEventListener("pointerdown", e => {
  joystickPointer = e.pointerId;
  joystick.setPointerCapture(e.pointerId);
  setJoystick(e.clientX, e.clientY);
});
joystick.addEventListener("pointermove", e => {
  if (e.pointerId === joystickPointer) setJoystick(e.clientX, e.clientY);
});
["pointerup", "pointercancel", "lostpointercapture"].forEach(ev => {
  joystick.addEventListener(ev, resetJoystick);
});

window.addEventListener("keydown", e => {
  const map = {
    ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
    ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
    ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
    ArrowRight: [1, 0], d: [1, 0], D: [1, 0]
  };
  if (map[e.key]) {
    input = { x: map[e.key][0], y: map[e.key][1] };
    e.preventDefault();
  }
});
window.addEventListener("keyup", () => resetJoystick());

$("#startBtn").addEventListener("click", startGame);
$("#openBoxBtn").addEventListener("click", () => show(screens.letter));

window.addEventListener("resize", () => {
  if (screens.game.classList.contains("active")) {
    resizeWorld();
    setPlayer();
  }
});

resizeWorld();
