// ---------- Shared state ----------
const screens = {
  menu: document.getElementById("screen-menu"),
  hearts: document.getElementById("screen-hearts"),

  memL1: document.getElementById("screen-memory-l1"),
  memL2: document.getElementById("screen-memory-l2"),
  memL3: document.getElementById("screen-memory-l3"),
  memWin: document.getElementById("screen-memory-win"),
};

const usernameInput = document.getElementById("username");
const menuHint = document.getElementById("menuHint");
const confirmUsernameBtn = document.getElementById("confirmUsernameBtn");
const usernameModal = document.getElementById("usernameModal");
const letsGoooBtn = document.getElementById("letsGoooBtn");
const modalTitle = document.getElementById("modalTitle");

const miniButtons = document.querySelectorAll(".miniBtn");



// ---- Confetti state (must be defined BEFORE stopConfetti can ever run) ----
// ---- Confetti state (unique names to avoid collisions) ----
var __confettiRunning = false;
var __confettiPieces = [];
var __confettiRAF = null;


let usernameConfirmed = false;


let username = "";

// Global "Back to Menu" handler (works for all current + future .backBtn buttons)
document.addEventListener("click", (e) => {
  const backBtn = e.target.closest(".backBtn");
  if (!backBtn) return;

  e.preventDefault();
  e.stopPropagation();

  if (screens.memWin && screens.memWin.classList.contains("active")) {
    stopConfetti();
  }

  showScreen("menu");
  window.scrollTo(0, 0);
});



function setGamesEnabled(enabled) {
  miniButtons.forEach(b => (b.disabled = !enabled));
}

setGamesEnabled(false);


// Show/hide screens
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screens[name].classList.add("active");
    // ✅ Always reset scroll position when changing screens
  window.scrollTo({ top: 0, behavior: "instant" });
}

// Update welcome text in game screens
function updateWelcome() {
  const welcome = document.getElementById("welcome");
  const welcome2 = document.getElementById("welcome2");
  const text = username ? `Hi, ${username} 💖` : "";
  if (welcome) welcome.textContent = text;
  if (welcome2) welcome2.textContent = text;
}

function ensureUsername() {
  if (!usernameConfirmed) {
    menuHint.textContent = "Confirm your username first 💙";
    return false;
  }
  menuHint.textContent = "";
  return true;
}

usernameModal.addEventListener("click", (e) => {
  if (e.target === usernameModal) {
    usernameModal.classList.add("hidden");
    usernameModal.setAttribute("aria-hidden", "true");
    menuHint.textContent = "Click “Let's gooo” to continue 💙";
  }
});


letsGoooBtn.addEventListener("click", () => {
  if (typeof window.maybeStartBackgroundMusic === "function") {
    window.maybeStartBackgroundMusic();
  }

  usernameModal.classList.add("hidden");
  usernameModal.setAttribute("aria-hidden", "true");

  usernameConfirmed = true;
  setGamesEnabled(true);
  menuHint.textContent = "Good job Pooksss! Now choose a mini game to start 💙";
});


confirmUsernameBtn.addEventListener("click", () => {
  // overwrite username no matter what they typed
  username = "Precious_Princess";
  updateWelcome();

  // show modal text (exact phrasing you asked)
  modalTitle.textContent = `You confirm choosing the username "${username}" EHEHEHEHEHEH`;

  // show modal
  usernameModal.classList.remove("hidden");
  usernameModal.setAttribute("aria-hidden", "false");

  // lock access until they click Let's gooo
  usernameConfirmed = false;
  setGamesEnabled(false);
});

window.startHeartsGame = function startHeartsGame() {
  // hearts game setup
}

function goToHearts() {
  if (typeof window.startHeartsGame !== "function") {
    console.error("startHeartsGame() is not loaded. Did you include hearts.js before game.js?");
    menuHint.textContent = "Hearts game isn't loaded yet 💙";
    return;
  }
  window.startHeartsGame();
  showScreen("hearts");
  window.scrollTo(0, 0);
}


// Menu buttons: choose which mini-game to open
document.querySelectorAll(".miniBtn").forEach(btn => {
  btn.addEventListener("click", async () => {
    if (!ensureUsername()) return;

    const target = btn.dataset.target;

    if (target === "memory") {
      await startMemoryLevel(1);
      showScreen("memL1");
      startConfetti();
      return;
    }

    if (target === "hearts") {
      goToHearts();
      return;
    }
  });
});


// ---------------- MEMORY MATCH (3 levels, image pool via manifest.json) ----------------

const MEMORY_POOL_FOLDER = "assets/memory/polar_bear";
const MEMORY_MANIFEST_URL = `${MEMORY_POOL_FOLDER}/manifest.json`;

const MEMORY_LEVELS = {
  1: { name: "Beginner", pairs: 6,  rows: 3, cardSize: 160 }, // bigger cards
  2: { name: "Medium",   pairs: 10, rows: 3, cardSize: 150 }, // slightly smaller
  3: { name: "Hard",     pairs: 14, rows: 4, cardSize: 140 }, // extra row for height safety
};



const memoryBoards = {
  1: document.getElementById("memoryBoardL1"),
  2: document.getElementById("memoryBoardL2"),
  3: document.getElementById("memoryBoardL3"),
};

const memoryMsgs = {
  1: document.getElementById("memoryMsgL1"),
  2: document.getElementById("memoryMsgL2"),
  3: document.getElementById("memoryMsgL3"),
};

const welcomeMem = document.getElementById("welcomeMem");
const welcomeMem2 = document.getElementById("welcomeMem2");
const welcomeMem3 = document.getElementById("welcomeMem3");

let imagePool = null;        // cached list from manifest.json
let memLock = false;
let memFirst = null;
let memPairsFound = 0;
let memPairsTotal = 0;
let currentLevel = 1;

function buildDeckFromPool(pool, pairs) {
  const chosen = sampleNoDuplicates(pool, pairs);
  return shuffle([...chosen, ...chosen]);
}

function isDeckValid(deck) {
  const counts = new Map();
  for (const k of deck) counts.set(k, (counts.get(k) || 0) + 1);

  // every key must appear exactly twice
  for (const [, c] of counts) {
    if (c !== 2) return false;
  }
  return deck.length % 2 === 0;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sampleNoDuplicates(arr, count) {
  const copy = [...arr];
  shuffle(copy);
  return copy.slice(0, count);
}

// Loads manifest once per page load
async function loadImagePool() {
  if (imagePool) return imagePool;

  const res = await fetch(MEMORY_MANIFEST_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load manifest.json: ${res.status}`);
  }

  const list = await res.json();

  // Keep only image-ish files (safety)
  imagePool = list.filter(name =>
    /\.(png|jpe?g|webp|gif)$/i.test(name)
  );

  if (imagePool.length < 2) {
    throw new Error("manifest.json has too few images.");
  }

  return imagePool;
}

function applyMemoryLayout(board, rows, totalCards, cardSize) {
  const gap = 14;

  board.style.display = "grid";
  board.style.gridAutoFlow = "column";
  board.style.gridTemplateRows = `repeat(${rows}, ${cardSize}px)`;
  board.style.gridAutoColumns = `${cardSize}px`;
  board.style.gap = `${gap}px`;
}



async function startMemoryLevel(level) {
  currentLevel = level;
  memLock = false;
  memFirst = null;
  memPairsFound = 0;

  const config = MEMORY_LEVELS[level];
  memPairsTotal = config.pairs;

  const t = username ? `Hi, ${username} 💙` : "";
  if (welcomeMem) welcomeMem.textContent = t;
  if (welcomeMem2) welcomeMem2.textContent = t;
  if (welcomeMem3) welcomeMem3.textContent = t;

  const board = memoryBoards[level];
  const msg = memoryMsgs[level];

  msg.textContent = "Loading bears…";
  board.innerHTML = "";

  const totalCards = config.pairs * 2;

  // ✅ THIS replaces applyColumns()
  applyMemoryLayout(board, config.rows, totalCards, config.cardSize);

  const pool = await loadImagePool();

  let deck = [];
  let tries = 0;

  do {
    deck = buildDeckFromPool(pool, config.pairs);
    tries++;
  } while (!isDeckValid(deck) && tries < 10);

  if (!isDeckValid(deck)) {
    throw new Error("Deck validation failed: could not generate perfect pairs.");
  }


  msg.textContent = "";

  deck.forEach((fileName) => {
    const tile = document.createElement("div");
    tile.className = "memory-tile";
    tile.dataset.key = fileName;

    tile.innerHTML = `
      <div class="front">❄️</div>
      <div class="back">
        <img src="${MEMORY_POOL_FOLDER}/${encodeURIComponent(fileName)}" alt="card" />
      </div>
    `;

    tile.addEventListener("click", () => onMemoryFlip(tile, level));
    board.appendChild(tile);
  });
}


function onMemoryFlip(tile, level) {
  // only react if the correct level screen is showing
  const levelScreen =
    level === 1 ? screens.memL1 :
    level === 2 ? screens.memL2 :
    screens.memL3;

  if (!levelScreen.classList.contains("active")) return;

  if (memLock) return;
  if (tile.classList.contains("matched")) return;
  if (tile === memFirst) return;

  tile.classList.add("revealed");

  if (!memFirst) {
    memFirst = tile;
    return;
  }

  const a = memFirst.dataset.key;
  const b = tile.dataset.key;

  if (a === b) {
    tile.classList.add("matched");
    memFirst.classList.add("matched");
    memFirst = null;
    memPairsFound++;

    if (memPairsFound === memPairsTotal) {
      onMemoryLevelWin(level);
    }
  } else {
    memLock = true;
    const prev = memFirst;
    memFirst = null;

    setTimeout(() => {
      tile.classList.remove("revealed");
      prev.classList.remove("revealed");
      memLock = false;
    }, 650);
  }
}

function onMemoryLevelWin(level) {
  const msg = memoryMsgs[level];
  msg.textContent = `Level cleared, ${username}! ✅`;

  setTimeout(async () => {
    if (level === 1) {
      await startMemoryLevel(2);
      showScreen("memL2");
    } else if (level === 2) {
      await startMemoryLevel(3);
      showScreen("memL3");
    } else {
      showMemoryWinScreen();
    }
  }, 900);
}

// ---------------- WIN SCREEN: confetti + fun fact + next mini game ----------------

const confettiCanvas = document.getElementById("confetti");
const winTitle = document.getElementById("winTitle");
const winText = document.getElementById("winText");
const funfactCard = document.querySelector(".funfact-card"); // Select by class since it's a container
const funfactText = document.getElementById("funfactText");
const nextMiniGameBtn = document.getElementById("nextMiniGameBtn");
const rerollBtn = document.getElementById("rerollFunFactBtn");
const funfactEndMsg = document.getElementById("funfactEndMsg");

const RARE_FUN_FACTS = [
  "Polar bears are very selective with their partners — when they choose someone, they stay close and gentle, spending days together getting to know each other.",
  "During mating season, polar bears often play together in the snow — rolling, pawing, and chasing in ways that look a lot like flirting.",
  "A male polar bear will patiently follow the female he likes for long distances, showing dedication and care rather than rushing her.",
  "Polar bear moms are incredibly loving — they raise their cubs alone, protecting them, cuddling them for warmth, and teaching them everything they need to survive."
];

// --- WIN SCREEN LOGIC ---

// 1. Initialize the pool immediately
let remainingFunFacts = [...RARE_FUN_FACTS];
let firstRevealDone = false;

function resetFunFacts() {
  remainingFunFacts = [...RARE_FUN_FACTS];
  firstRevealDone = false;
  if (funfactText) funfactText.textContent = "Click to reveal…";
  if (funfactEndMsg) funfactEndMsg.textContent = "";
  if (rerollBtn) rerollBtn.style.display = "none";
}

function rollFunFact() {
  // If we are out of facts
  if (remainingFunFacts.length === 0) {
    funfactText.textContent = "More fun facts to be added soon… 💙";
    if (rerollBtn) rerollBtn.style.display = "none";
    if (funfactEndMsg) funfactEndMsg.textContent = "You've seen them all! 💙";
    return;
  }

  // Pick a random fact
  const index = Math.floor(Math.random() * remainingFunFacts.length);
  const fact = remainingFunFacts.splice(index, 1)[0];
  
  // Display the fact
  funfactText.textContent = fact;

  // If that was the LAST fact, hide the reroll button immediately
  if (remainingFunFacts.length === 0) {
    if (rerollBtn) rerollBtn.style.display = "none";
    if (funfactEndMsg) funfactEndMsg.textContent = "You've seen them all! 💙";
  } else if (firstRevealDone) {
    // Show reroll button only if facts remain and we've already revealed once
    if (rerollBtn) rerollBtn.style.display = "inline-block";
  }
}

// 2. Attach the listeners
if (funfactCard) {
  funfactCard.onclick = () => {
    if (!firstRevealDone) {
      firstRevealDone = true;
      rollFunFact();
    }
  };
}

if (rerollBtn) {
  rerollBtn.onclick = (e) => {
    e.stopPropagation(); // Stops the card's click from firing
    rollFunFact();
  };
}


nextMiniGameBtn.addEventListener("click", () => {
  stopConfetti();
  goToHearts();
});

function showMemoryWinScreen() {
  resetFunFacts();

  winTitle.textContent = `Congrats!!! ${username}! 🎉`;
  winText.textContent = "You Won! You're so Intelligent and Hot 😍😍😍";

  showScreen("memWin");
  startConfetti();
}

// ---------------- Simple Confetti (no libraries) ----------------

function resizeConfetti() {
  if (!confettiCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  confettiCanvas.width = Math.floor(window.innerWidth * dpr);
  confettiCanvas.height = Math.floor(window.innerHeight * dpr);
  confettiCanvas.style.width = window.innerWidth + "px";
  confettiCanvas.style.height = window.innerHeight + "px";
}

window.addEventListener("resize", resizeConfetti);

function startConfetti() {
  if (!confettiCanvas) return;
  resizeConfetti();

  const ctx = confettiCanvas.getContext("2d");
  const W = confettiCanvas.width;
  const H = confettiCanvas.height;

  __confettiPieces = Array.from({ length: 180 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H - H,
    w: 6 + Math.random() * 10,
    h: 8 + Math.random() * 12,
    vx: (-1 + Math.random() * 2) * 1.2,
    vy: 2 + Math.random() * 4,
    rot: Math.random() * Math.PI,
    vr: (-0.12 + Math.random() * 0.24),
  }));

  __confettiRunning = true;

  function tick() {
    if (!__confettiRunning) return;

    ctx.clearRect(0, 0, W, H);

    for (const p of __confettiPieces) {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;

      if (p.y > H + 40) {
        p.y = -40;
        p.x = Math.random() * W;
      }
      if (p.x < -40) p.x = W + 40;
      if (p.x > W + 40) p.x = -40;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    __confettiRAF = requestAnimationFrame(tick);
  }

  tick();

  setTimeout(stopConfetti, 6500);
}


function stopConfetti() {
  __confettiRunning = false;
  if (__confettiRAF) cancelAnimationFrame(__confettiRAF);
  __confettiRAF = null;

  const ctx = confettiCanvas?.getContext("2d");
  if (ctx && confettiCanvas) {
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  }
}


// Start at menu
showScreen("menu");
