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

const player = {
  x: 0, y: 0,
  r: 25,
  speed: 195,
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
  setTimeout(() => messageEl.classList.remove("show"), 1100);
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
    r: 28,
    el,
    speed: 95 + index * 12, // чуть разная скорость (медленнее игрока)
    type: index // 0 = прямой охотник, 1 = перехватчик на опережение, 2 = хитрый обходчик
  };
}

// === КРАСИВАЯ ГЕНЕРАЦИЯ СЕРДЕЧЕК (Сетка 3х4 с мягким смещением) ===
function spawnBalancedHearts(w, h){
  const marginX = w * 0.12;
  const marginTop = h * 0.16;   // отступ сверху под счетчики
  const marginBottom = h * 0.18; // отступ снизу под джойстик

  const usableW = w - marginX * 2;
  const usableH = h - marginTop - marginBottom;

  const cols = 3;
  const rows = 4;
  const cellW = usableW / cols;
  const cellH = usableH / rows;

  for(let r = 0; r < rows; r++){
    for(let c = 0; c < cols; c++){
      // Центр сектора + случайное смещение внутри него
      const centerX = marginX + (c + 0.5) * cellW;
      const centerY = marginTop + (r + 0.5) * cellH;

      let x = centerX + random(-cellW * 0.3, cellW * 0.3);
      let y = centerY + random(-cellH * 0.3, cellH * 0.3);

      // Если сердечко попадает слишком близко к старту игрока — отодвигаем вверх
      if(distance({x, y}, player) < 130){
        y -= cellH * 0.6;
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

  // Раскладываем сердечки по полянке
  spawnBalancedHearts(rect.width, rect.height);

  // Котики появляются в верхней части экрана (подальше от игрока)
  const catSpawns = [
    { x: rect.width * 0.20, y: rect.height * 0.24 },
    { x: rect.width * 0.50, y: rect.height * 0.18 },
    { x: rect.width * 0.80, y: rect.height * 0.24 }
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
  invulnerableUntil = now + 1400;
  damageFlash.classList.remove("hit");
  void damageFlash.offsetWidth;
  damageFlash.classList.add("hit");
  livesEl.textContent = "♡ ".repeat(lives).trim();

  if(navigator.vibrate) navigator.vibrate([50, 40, 50]);

  if(lives <= 0){
    gameRunning = false;
    message("Котики поймали тебя... Начинаем заново!");
    setTimeout(startGame, 900);
  } else {
    message("Ой! Котик тебя поймал!");
    const rect = world.getBoundingClientRect();
    player.x = rect.width * 0.50;
    player.y = rect.height * 0.78;
    setPlayer();
  }
}

// === УМНЫЙ ИИ ДЛЯ КОТИКОВ ===
function updateCats(dt){
  const w = world.clientWidth;
  const h = world.clientHeight;

  cats.forEach(cat => {
    let targetX = player.x;
    let targetY = player.y;

    // Кот 1: Охотник — бежит точно к игроку
    if (cat.type === 0) {
      targetX = player.x;
      targetY = player.y;
    }
    // Кот 2: Перехватчик — прогнозирует движение игрока наперед
    else if (cat.type === 1) {
      const pLen = Math.hypot(input.x, input.y);
      if (pLen > 0.1) {
        // Вычисляем точку на 130px вперед по курсу игрока
        targetX = player.x + (input.x / pLen) * 130;
        targetY = player.y + (input.y / pLen) * 130;
      }
    }
    // Кот 3: Хитрый обходчик — заходит с фланга по дуге
    else if (cat.type === 2) {
      const d = distance(cat, player);
      if (d < 240) {
        // Обходной вектор (перпендикулярно прямой на игрока)
        const perpX = -(player.y - cat.y);
        const perpY = (player.x - cat.x);
        const perpLen = Math.hypot(perpX, perpY) || 1;
        targetX = player.x + (perpX / perpLen) * 90;
        targetY = player.y + (perpY / perpLen) * 90;
      }
    }

    // Вектор к цели
    const dx = targetX - cat.x;
    const dy = targetY - cat.y;
    const len = Math.hypot(dx, dy) || 1;
    let desiredVx = (dx / len) * cat.speed;
    let desiredVy = (dy / len) * cat.speed;

    // Анти-слипание (котики расталкивают друг друга)
    let repulseX = 0;
    let repulseY = 0;
    cats.forEach(other => {
      if (other === cat) return;
      const d = distance(cat, other);
      if (d < 60 && d > 0) {
        const force = (60 - d) / 60;
        repulseX += ((cat.x - other.x) / d) * force * 100;
        repulseY += ((cat.y - other.y) / d) * force * 100;
      }
    });

    // Плавное руление (инерция)
    cat.vx += (desiredVx + repulseX - cat.vx) * Math.min(dt * 4.5, 1);
    cat.vy += (desiredVy + repulseY - cat.vy) * Math.min(dt * 4.5, 1);

    cat.x += cat.vx * dt;
    cat.y += cat.vy * dt;

    // Ограничение границами поля
    cat.x = clamp(cat.x, 35, w - 35);
    cat.y = clamp(cat.y, 80, h - 55);

    cat.el.style.left = cat.x + "px";
    cat.el.style.top = cat.y + "px";

    // Поворот спрайта котика в сторону бега
    if (Math.abs(cat.vx) > 5) {
      cat.el.querySelector("img").style.transform = `scaleX(${cat.vx < 0 ? -1 : 1})`;
    }

    // Проверка пойман ли игрок
    if (distance(cat, player) < cat.r + player.r) {
      hitByCat();
    }
  });
}

// === СВОБОДНОЕ ПЕРЕМЕЩЕНИЕ ИГРОКА ===
function updatePlayer(dt){
  if(!input.x && !input.y) return;

  const len = Math.hypot(input.x, input.y) || 1;
  const moveX = (input.x / len) * player.speed * dt;
  const moveY = (input.y / len) * player.speed * dt;

  player.x += moveX;
  player.y += moveY;

  if (input.x < -0.1) player.facingLeft = true;
  if (input.x > 0.1) player.facingLeft = false;

  const w = world.clientWidth;
  const h = world.clientHeight;
  player.x = clamp(player.x, 35, w - 35);
  player.y = clamp(player.y, 90, h - 50);

  setPlayer();
}

function checkHearts(){
  for(let i = hearts.length - 1; i >= 0; i--){
    if(distance(player, hearts[i]) < player.r + hearts[i].r){
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
  updateCats(dt);

  requestAnimationFrame(loop);
}

// === УПРАВЛЕНИЕ ДЖОЙСТИКОМ И КЛАВИАТУРОЙ ===
function setJoystick(clientX, clientY){
  const r = joystick.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  let dx = clientX - cx;
  let dy = clientY - cy;
  const max = r.width * 0.34;
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