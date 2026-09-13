const socket = io();

const AVATAR_OPTIONS = ["🙂", "😎", "🦊", "🐼", "🚀", "🔥", "🎯", "🐙", "🍀", "🦄"];
const PREMIUM_AVATARS = ["🐲", "🦁", "🐺", "🧙", "👽", "🤖"];
const AVATAR_PRICES = { "🐲": 60, "🦁": 50, "🐺": 40, "🧙": 60, "👽": 70, "🤖": 70 };

function generateToken() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "t-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function readLS(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function writeLS(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    /* localStorage no disponible */
  }
}

/* ---------- Tema claro/oscuro ---------- */

let theme = readLS("cc1v1_theme", "dark");

function applyTheme(t) {
  theme = t;
  document.documentElement.setAttribute("data-theme", t);
}
applyTheme(theme);

/* ---------- Sonido (generado con Web Audio, sin ficheros externos) ---------- */

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function resumeAudio() {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === "suspended") ctx.resume();
  } catch (e) {
    /* audio no disponible */
  }
}

let muted = readLS("cc1v1_muted", "0") === "1";

function beep({ freq = 440, duration = 0.15, type = "sine", volume = 0.2, delay = 0 } = {}) {
  if (muted) return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const startTime = ctx.currentTime + delay;
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  } catch (e) {
    /* audio no disponible */
  }
}

const sounds = {
  line: () => beep({ freq: 480, duration: 0.07, type: "square", volume: 0.1 }),
  box: () => beep({ freq: 660, duration: 0.14, type: "triangle", volume: 0.18 }),
  yourTurn: () => beep({ freq: 660, duration: 0.1, volume: 0.1 }),
  match: () => {
    beep({ freq: 440, duration: 0.1, volume: 0.15 });
    beep({ freq: 554, duration: 0.1, volume: 0.15, delay: 0.1 });
    beep({ freq: 659, duration: 0.16, volume: 0.15, delay: 0.2 });
  },
  powerMultiplier: () => {
    beep({ freq: 784, duration: 0.1, volume: 0.2 });
    beep({ freq: 988, duration: 0.18, volume: 0.2, delay: 0.1 });
  },
  powerBomb: () => {
    beep({ freq: 180, duration: 0.28, type: "sawtooth", volume: 0.22 });
    beep({ freq: 90, duration: 0.32, type: "sawtooth", volume: 0.2, delay: 0.08 });
  },
  powerIce: () => {
    beep({ freq: 900, duration: 0.12, type: "sine", volume: 0.14 });
    beep({ freq: 1200, duration: 0.16, type: "sine", volume: 0.12, delay: 0.1 });
  },
  win: () => {
    beep({ freq: 523, duration: 0.15, volume: 0.2 });
    beep({ freq: 659, duration: 0.15, volume: 0.2, delay: 0.15 });
    beep({ freq: 784, duration: 0.35, volume: 0.22, delay: 0.3 });
  },
  lose: () => {
    beep({ freq: 392, duration: 0.22, type: "sawtooth", volume: 0.15 });
    beep({ freq: 294, duration: 0.4, type: "sawtooth", volume: 0.15, delay: 0.2 });
  },
  timeout: () => beep({ freq: 220, duration: 0.25, type: "sawtooth", volume: 0.15 }),
  chat: () => beep({ freq: 720, duration: 0.06, type: "sine", volume: 0.08 }),
  giftCode: () => {
    beep({ freq: 784, duration: 0.1, volume: 0.18 });
    beep({ freq: 988, duration: 0.18, volume: 0.2, delay: 0.1 });
  },
};

/* ---------- Confeti ---------- */

function launchConfetti() {
  const container = document.createElement("div");
  container.className = "confetti-container";
  document.body.appendChild(container);
  const colors = ["#38bdf8", "#22d3ee", "#22c55e", "#fbbf24", "#f472b6", "#a78bfa"];
  for (let i = 0; i < 120; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = 2.2 + Math.random() * 1.8 + "s";
    piece.style.animationDelay = Math.random() * 0.4 + "s";
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(piece);
  }
  setTimeout(() => container.remove(), 4500);
}

/* ---------- Barra de tiempo por turno ---------- */

const timerFill = document.getElementById("timer-fill");
let timerInterval = null;

function startTurnTimer(seconds) {
  clearInterval(timerInterval);
  timerFill.classList.remove("running", "low-time");
  void timerFill.offsetWidth;
  timerFill.style.animationDuration = seconds + "s";
  timerFill.classList.add("running");

  let remaining = seconds;
  timerInterval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 10) timerFill.classList.add("low-time");
    if (remaining <= 0) clearInterval(timerInterval);
  }, 1000);
}

function stopTurnTimer() {
  clearInterval(timerInterval);
  timerFill.classList.remove("running", "low-time");
}

/* ---------- Pantallas ---------- */

const screens = {
  home: document.getElementById("home-screen"),
  inventory: document.getElementById("inventory-screen"),
  ranking: document.getElementById("ranking-screen"),
  shop: document.getElementById("shop-screen"),
  profile: document.getElementById("profile-screen"),
  settings: document.getElementById("settings-screen"),
  quickmatch: document.getElementById("quickmatch-screen"),
  friends: document.getElementById("friends-screen"),
  joinCode: document.getElementById("join-code-screen"),
  roomCode: document.getElementById("room-code-screen"),
  lobby: document.getElementById("lobby-screen"),
  waiting: document.getElementById("waiting-screen"),
  game: document.getElementById("game-screen"),
  gameover: document.getElementById("gameover-screen"),
};

const SHELL_SCREENS = new Set(["home", "inventory", "ranking", "shop"]);

function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.add("hidden"));
  screens[name].classList.remove("hidden");
  document.body.classList.toggle("shell-mode", SHELL_SCREENS.has(name));
}

function updateSessionScoreLabel(you, opponent) {
  scoreLabel.textContent = `${you} – ${opponent}`;
}

/* ---------- Estadísticas persistentes ---------- */

function readStats() {
  try {
    return JSON.parse(localStorage.getItem("cc1v1_stats") || "null") || { wins: 0, losses: 0 };
  } catch (e) {
    return { wins: 0, losses: 0 };
  }
}

function writeStats(stats) {
  try {
    localStorage.setItem("cc1v1_stats", JSON.stringify(stats));
  } catch (e) {
    /* localStorage no disponible */
  }
}

/* ---------- Sesión (para reconectar tras recargar) ---------- */

function saveSession() {
  try {
    sessionStorage.setItem(
      "cc1v1_session",
      JSON.stringify({ token: myToken, name: myName, avatar: myAvatar, mode: currentMode })
    );
  } catch (e) {
    /* sessionStorage no disponible */
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem("cc1v1_session");
  } catch (e) {
    /* sessionStorage no disponible */
  }
}

/* ---------- Inicio ---------- */

const homeProfileSummary = document.getElementById("home-profile-summary");
const homeAvatarEl = document.getElementById("home-avatar");
const homeNameEl = document.getElementById("home-name");
const findMatchBtn = document.getElementById("find-match-btn");
const playFriendsBtn = document.getElementById("play-friends-btn");
const openSettingsBtn = document.getElementById("open-settings-btn");
const openMessagesBtn = document.getElementById("open-messages-btn");
const messagesToast = document.getElementById("messages-toast");

function refreshHomeSummary() {
  homeAvatarEl.textContent = readLS("cc1v1_avatar", AVATAR_OPTIONS[0]);
  homeNameEl.textContent = readLS("cc1v1_name", "").trim() || "Jugador";
}

function goHome() {
  refreshHomeSummary();
  showScreen("home");
}

findMatchBtn.addEventListener("click", () => {
  refreshModeButtons(modeButtons, selectedMode);
  quickmatchError.textContent = "";
  showScreen("quickmatch");
});
playFriendsBtn.addEventListener("click", () => showScreen("friends"));
homeProfileSummary.addEventListener("click", openProfile);
openSettingsBtn.addEventListener("click", () => {
  refreshSettingsDisplay();
  showScreen("settings");
});

let messagesToastTimeout = null;
openMessagesBtn.addEventListener("click", () => {
  messagesToast.classList.remove("hidden");
  clearTimeout(messagesToastTimeout);
  messagesToastTimeout = setTimeout(() => messagesToast.classList.add("hidden"), 2500);
});

/* ---------- Navegación inferior (Inicio / Inventario / Ranking / Tienda) ---------- */

document.querySelectorAll("[data-nav]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.nav;
    if (target === "inventory") refreshInventoryScreen();
    if (target === "ranking") refreshRankingScreen();
    if (target === "shop") refreshShopScreen();
    showScreen(target);
  });
});

/* ---------- Perfil ---------- */

const nameInput = document.getElementById("name-input");
const avatarPicker = document.getElementById("avatar-picker");
const profileAvatarPreview = document.getElementById("profile-avatar-preview");
const profileCoinsEl = document.getElementById("profile-coins");
const profileRankEl = document.getElementById("profile-rank");
const profileRecordEl = document.getElementById("profile-record");
const profileCoinsChip = document.getElementById("profile-coins-chip");
const profileRankChip = document.getElementById("profile-rank-chip");
const profileRecordChip = document.getElementById("profile-record-chip");
const profileSaveBtn = document.getElementById("profile-save-btn");
const profileBackBtn = document.getElementById("profile-back-btn");

let selectedAvatar = readLS("cc1v1_avatar", AVATAR_OPTIONS[0]);

AVATAR_OPTIONS.forEach((emoji) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "avatar-option" + (emoji === selectedAvatar ? " selected" : "");
  btn.textContent = emoji;
  btn.addEventListener("click", () => {
    selectedAvatar = emoji;
    avatarPicker.querySelectorAll(".avatar-option").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    writeLS("cc1v1_avatar", emoji);
    profileAvatarPreview.textContent = emoji;
  });
  avatarPicker.appendChild(btn);
});

function refreshProfileSummary() {
  profileAvatarPreview.textContent = selectedAvatar;
  profileCoinsEl.textContent = readCoins();
  const stats = readStats();
  profileRecordEl.textContent = `${stats.wins}-${stats.losses}`;
  profileRankEl.textContent = rankTier(stats.wins).split(" ")[1] || "🥉";
}

function goToRankingFromProfile() {
  refreshRankingScreen();
  showScreen("ranking");
}

profileCoinsChip.addEventListener("click", () => {
  refreshShopScreen();
  showScreen("shop");
});
profileRankChip.addEventListener("click", goToRankingFromProfile);
profileRecordChip.addEventListener("click", goToRankingFromProfile);

function openProfile() {
  nameInput.value = readLS("cc1v1_name", "");
  refreshProfileSummary();
  showScreen("profile");
}

function saveProfileAndGoHome() {
  writeLS("cc1v1_name", nameInput.value.trim());
  goHome();
}

profileSaveBtn.addEventListener("click", saveProfileAndGoHome);
profileBackBtn.addEventListener("click", saveProfileAndGoHome);

/* ---------- Monedas, inventario, ranking y tienda ---------- */

const WIN_COINS = 10;

function readCoins() {
  return parseInt(readLS("cc1v1_coins", "0"), 10) || 0;
}
function writeCoins(value) {
  writeLS("cc1v1_coins", String(Math.max(0, value)));
}

function readBestStreak() {
  return parseInt(readLS("cc1v1_best_streak", "0"), 10) || 0;
}
function readCurrentStreak() {
  return parseInt(readLS("cc1v1_current_streak", "0"), 10) || 0;
}

function readOwnedThemes() {
  try {
    return JSON.parse(localStorage.getItem("cc1v1_owned_themes") || '["menta"]');
  } catch (e) {
    return ["menta"];
  }
}
function writeOwnedThemes(list) {
  writeLS("cc1v1_owned_themes", JSON.stringify(list));
}
function readEquippedTheme() {
  return readLS("cc1v1_equipped_theme", "menta");
}
function writeEquippedTheme(id) {
  writeLS("cc1v1_equipped_theme", id);
}

const ACCENT_THEMES = [
  { id: "menta", label: "Menta", price: 0, accent: "#34d399", accentStrong: "#6ee7b7", accentDark: "#059669" },
  { id: "oceano", label: "Océano", price: 30, accent: "#38bdf8", accentStrong: "#7dd3fc", accentDark: "#0284c7" },
  { id: "atardecer", label: "Atardecer", price: 30, accent: "#fb923c", accentStrong: "#fdba74", accentDark: "#c2410c" },
  { id: "lavanda", label: "Lavanda", price: 40, accent: "#a78bfa", accentStrong: "#c4b5fd", accentDark: "#7c3aed" },
  { id: "rubi", label: "Rubí", price: 40, accent: "#fb7185", accentStrong: "#fda4af", accentDark: "#be123c" },
  { id: "bosque", label: "Bosque", price: 50, accent: "#4ade80", accentStrong: "#86efac", accentDark: "#15803d" },
  { id: "grafito", label: "Grafito", price: 50, accent: "#94a3b8", accentStrong: "#cbd5e1", accentDark: "#475569" },
  { id: "oro", label: "Oro", price: 80, accent: "#facc15", accentStrong: "#fde047", accentDark: "#ca8a04" },
];

/* ---------- Avatares premium ---------- */

function readOwnedAvatars() {
  try {
    return JSON.parse(localStorage.getItem("cc1v1_owned_avatars") || JSON.stringify(AVATAR_OPTIONS));
  } catch (e) {
    return AVATAR_OPTIONS.slice();
  }
}
function writeOwnedAvatars(list) {
  writeLS("cc1v1_owned_avatars", JSON.stringify(list));
}

/* ---------- Marcos de avatar ---------- */

const AVATAR_FRAMES = [
  { id: "ninguno", label: "Sin marco", price: 0, color: "transparent" },
  { id: "esmeralda", label: "Esmeralda", price: 40, color: "#34d399" },
  { id: "zafiro", label: "Zafiro", price: 40, color: "#38bdf8" },
  { id: "fuego", label: "Fuego", price: 50, color: "#fb7185" },
  { id: "oro", label: "Oro", price: 70, color: "#facc15" },
];

function readOwnedFrames() {
  try {
    return JSON.parse(localStorage.getItem("cc1v1_owned_frames") || '["ninguno"]');
  } catch (e) {
    return ["ninguno"];
  }
}
function writeOwnedFrames(list) {
  writeLS("cc1v1_owned_frames", JSON.stringify(list));
}
function readEquippedFrame() {
  return readLS("cc1v1_equipped_frame", "ninguno");
}
function writeEquippedFrame(id) {
  writeLS("cc1v1_equipped_frame", id);
}
function applyAvatarFrame(id) {
  const frame = AVATAR_FRAMES.find((f) => f.id === id) || AVATAR_FRAMES[0];
  document.documentElement.style.setProperty("--frame-color", frame.color);
  document.body.classList.toggle("has-frame", frame.id !== "ninguno");
}
applyAvatarFrame(readEquippedFrame());

function applyAccentTheme(id) {
  const theme = ACCENT_THEMES.find((t) => t.id === id) || ACCENT_THEMES[0];
  const root = document.documentElement.style;
  if (theme.id === "menta") {
    root.removeProperty("--accent");
    root.removeProperty("--accent-strong");
    root.removeProperty("--accent-dark");
    return;
  }
  root.setProperty("--accent", theme.accent);
  root.setProperty("--accent-strong", theme.accentStrong);
  root.setProperty("--accent-dark", theme.accentDark);
}

applyAccentTheme(readEquippedTheme());

function rankTier(wins) {
  if (wins >= 30) return "Platino 💎";
  if (wins >= 15) return "Oro 🥇";
  if (wins >= 5) return "Plata 🥈";
  return "Bronce 🥉";
}

const inventoryCoinsEl = document.getElementById("inventory-coins");
const inventoryEquippedAvatarEl = document.getElementById("inventory-equipped-avatar");
const inventoryAvatarGrid = document.getElementById("inventory-avatar-grid");
const inventoryThemeGrid = document.getElementById("inventory-theme-grid");

function renderInventoryAvatars() {
  const current = readLS("cc1v1_avatar", AVATAR_OPTIONS[0]);
  inventoryEquippedAvatarEl.textContent = current;
  inventoryAvatarGrid.innerHTML = "";
  readOwnedAvatars().forEach((emoji) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "shell-avatar-card" + (emoji === current ? " equipped" : "");
    btn.textContent = emoji;
    btn.addEventListener("click", () => {
      selectedAvatar = emoji;
      writeLS("cc1v1_avatar", emoji);
      avatarPicker.querySelectorAll(".avatar-option").forEach((b) => {
        b.classList.toggle("selected", b.textContent === emoji);
      });
      refreshHomeSummary();
      renderInventoryAvatars();
    });
    inventoryAvatarGrid.appendChild(btn);
  });
}

function renderThemeCard(theme, { showPrice }) {
  const owned = readOwnedThemes();
  const equipped = readEquippedTheme();
  const isOwned = owned.includes(theme.id);
  const isEquipped = equipped === theme.id;

  const card = document.createElement("button");
  card.type = "button";
  card.className = "shell-theme-card" + (isEquipped ? " equipped" : "");
  card.style.setProperty("--swatch", theme.accent);
  const status = isEquipped
    ? "Equipado"
    : isOwned
    ? "Equipar"
    : showPrice
    ? `<span class="coin-icon"></span> ${theme.price}`
    : "Bloqueado";
  card.innerHTML = `<span class="shell-theme-swatch"></span><strong>${theme.label}</strong><small>${status}</small>`;

  card.addEventListener("click", () => {
    if (isEquipped) return;
    if (!isOwned) {
      if (!showPrice) return;
      const coins = readCoins();
      if (coins < theme.price) {
        card.classList.add("shake");
        setTimeout(() => card.classList.remove("shake"), 300);
        return;
      }
      writeCoins(coins - theme.price);
      writeOwnedThemes([...owned, theme.id]);
      shopCoinsEl.textContent = readCoins();
      inventoryCoinsEl.textContent = readCoins();
    }
    writeEquippedTheme(theme.id);
    applyAccentTheme(theme.id);
    renderShopThemes();
    renderInventoryThemes();
  });

  return card;
}

function renderInventoryThemes() {
  const owned = readOwnedThemes();
  inventoryThemeGrid.innerHTML = "";
  ACCENT_THEMES.filter((t) => owned.includes(t.id)).forEach((theme) => {
    inventoryThemeGrid.appendChild(renderThemeCard(theme, { showPrice: false }));
  });
}

function refreshInventoryScreen() {
  inventoryCoinsEl.textContent = readCoins();
  renderInventoryAvatars();
  renderInventoryThemes();
  renderInventoryFrames();
}

function renderAvatarShopCard(emoji, price) {
  const owned = readOwnedAvatars();
  const current = readLS("cc1v1_avatar", AVATAR_OPTIONS[0]);
  const isOwned = owned.includes(emoji);
  const isEquipped = current === emoji;

  const card = document.createElement("button");
  card.type = "button";
  card.className = "shell-theme-card" + (isEquipped ? " equipped" : "");
  const status = isEquipped ? "Equipado" : isOwned ? "Equipar" : `<span class="coin-icon"></span> ${price}`;
  card.innerHTML = `<span class="shop-avatar-emoji">${emoji}</span><small>${status}</small>`;

  card.addEventListener("click", () => {
    if (isEquipped) return;
    if (!isOwned) {
      const coins = readCoins();
      if (coins < price) {
        card.classList.add("shake");
        setTimeout(() => card.classList.remove("shake"), 300);
        return;
      }
      writeCoins(coins - price);
      writeOwnedAvatars([...owned, emoji]);
      shopCoinsEl.textContent = readCoins();
      inventoryCoinsEl.textContent = readCoins();
    }
    selectedAvatar = emoji;
    writeLS("cc1v1_avatar", emoji);
    refreshHomeSummary();
    renderShopAvatars();
    renderInventoryAvatars();
  });

  return card;
}

function renderShopAvatars() {
  shopAvatarGrid.innerHTML = "";
  PREMIUM_AVATARS.forEach((emoji) => {
    shopAvatarGrid.appendChild(renderAvatarShopCard(emoji, AVATAR_PRICES[emoji]));
  });
}

function renderFrameCard(frame) {
  const owned = readOwnedFrames();
  const equipped = readEquippedFrame();
  const isOwned = owned.includes(frame.id);
  const isEquipped = equipped === frame.id;

  const card = document.createElement("button");
  card.type = "button";
  card.className = "shell-theme-card" + (isEquipped ? " equipped" : "");
  card.style.setProperty("--swatch", frame.color === "transparent" ? "var(--shell-glass-border)" : frame.color);
  const status = isEquipped
    ? "Equipado"
    : isOwned
    ? "Equipar"
    : frame.price === 0
    ? "Gratis"
    : `<span class="coin-icon"></span> ${frame.price}`;
  card.innerHTML = `<span class="shell-theme-swatch frame-swatch"></span><strong>${frame.label}</strong><small>${status}</small>`;

  card.addEventListener("click", () => {
    if (isEquipped) return;
    if (!isOwned) {
      if (frame.price > 0) {
        const coins = readCoins();
        if (coins < frame.price) {
          card.classList.add("shake");
          setTimeout(() => card.classList.remove("shake"), 300);
          return;
        }
        writeCoins(coins - frame.price);
        shopCoinsEl.textContent = readCoins();
        inventoryCoinsEl.textContent = readCoins();
      }
      writeOwnedFrames([...owned, frame.id]);
    }
    writeEquippedFrame(frame.id);
    applyAvatarFrame(frame.id);
    renderShopFrames();
    renderInventoryFrames();
  });

  return card;
}

function renderShopFrames() {
  shopFrameGrid.innerHTML = "";
  AVATAR_FRAMES.forEach((frame) => shopFrameGrid.appendChild(renderFrameCard(frame)));
}

function renderInventoryFrames() {
  const owned = readOwnedFrames();
  inventoryFrameGrid.innerHTML = "";
  AVATAR_FRAMES.filter((f) => owned.includes(f.id)).forEach((frame) => {
    inventoryFrameGrid.appendChild(renderFrameCard(frame));
  });
}

const rankingTierEl = document.getElementById("ranking-tier");
const rankingWinsEl = document.getElementById("ranking-wins");
const rankingLossesEl = document.getElementById("ranking-losses");
const rankingWinrateEl = document.getElementById("ranking-winrate");
const rankingStreakEl = document.getElementById("ranking-streak");

function refreshRankingScreen() {
  const stats = readStats();
  const total = stats.wins + stats.losses;
  const winrate = total > 0 ? Math.round((stats.wins / total) * 100) : 0;
  rankingTierEl.textContent = rankTier(stats.wins);
  rankingWinsEl.textContent = stats.wins;
  rankingLossesEl.textContent = stats.losses;
  rankingWinrateEl.textContent = winrate + "%";
  rankingStreakEl.textContent = readBestStreak();
}

const shopCoinsEl = document.getElementById("shop-coins");
const shopThemeGrid = document.getElementById("shop-theme-grid");
const shopAvatarGrid = document.getElementById("shop-avatar-grid");
const shopFrameGrid = document.getElementById("shop-frame-grid");
const inventoryFrameGrid = document.getElementById("inventory-frame-grid");

function renderShopThemes() {
  shopThemeGrid.innerHTML = "";
  ACCENT_THEMES.forEach((theme) => {
    shopThemeGrid.appendChild(renderThemeCard(theme, { showPrice: true }));
  });
}

function refreshShopScreen() {
  shopCoinsEl.textContent = readCoins();
  renderShopThemes();
  renderShopAvatars();
  renderShopFrames();
  giftCodeMessage.textContent = "";
}

/* ---------- Código de regalo ---------- */

const GIFT_CODE = "labombalepeta";
const GIFT_CODE_COINS = 250;

const giftCodeInput = document.getElementById("gift-code-input");
const giftCodeBtn = document.getElementById("gift-code-btn");
const giftCodeMessage = document.getElementById("gift-code-message");

function redeemGiftCode() {
  const code = giftCodeInput.value.trim().toLowerCase();
  if (!code) return;

  if (code === GIFT_CODE) {
    resumeAudio();
    writeCoins(readCoins() + GIFT_CODE_COINS);
    shopCoinsEl.textContent = readCoins();
    giftCodeMessage.textContent = `¡+${GIFT_CODE_COINS} monedas!`;
    giftCodeMessage.className = "shell-giftcode-message success";
    giftCodeInput.value = "";
    sounds.giftCode();
  } else {
    giftCodeMessage.textContent = "Código incorrecto.";
    giftCodeMessage.className = "shell-giftcode-message error";
    giftCodeInput.classList.add("shake");
    setTimeout(() => giftCodeInput.classList.remove("shake"), 300);
  }
}

giftCodeBtn.addEventListener("click", redeemGiftCode);
giftCodeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") redeemGiftCode();
});

/* ---------- Ajustes ---------- */

const themeToggleRow = document.getElementById("theme-toggle-row");
const themeIcon = document.getElementById("theme-icon");
const themeValue = document.getElementById("theme-value");
const soundToggleRow = document.getElementById("sound-toggle-row");
const soundIcon = document.getElementById("sound-icon");
const soundValue = document.getElementById("sound-value");
const settingsBackBtn = document.getElementById("settings-back-btn");

function refreshSettingsDisplay() {
  themeIcon.textContent = theme === "light" ? "☀️" : "🌙";
  themeValue.textContent = theme === "light" ? "Claro" : "Oscuro";
  soundIcon.textContent = muted ? "🔇" : "🔊";
  soundValue.textContent = muted ? "Desactivado" : "Activado";
}

themeToggleRow.addEventListener("click", () => {
  applyTheme(theme === "light" ? "dark" : "light");
  writeLS("cc1v1_theme", theme);
  refreshSettingsDisplay();
});

soundToggleRow.addEventListener("click", () => {
  muted = !muted;
  writeLS("cc1v1_muted", muted ? "1" : "0");
  refreshSettingsDisplay();
});

settingsBackBtn.addEventListener("click", goHome);

/* ---------- Jugar con amigos ---------- */

const createRoomBtn = document.getElementById("create-room-btn");
const joinRoomBtn = document.getElementById("join-room-btn");
const friendsBackBtn = document.getElementById("friends-back-btn");

createRoomBtn.addEventListener("click", () => {
  resumeAudio();
  myToken = generateToken();
  myName = readLS("cc1v1_name", "").trim() || "Jugador";
  myAvatar = selectedAvatar;
  socket.emit("create_room", { name: myName, avatar: myAvatar, token: myToken });
  waitingText.textContent = "Creando partida...";
  showScreen("waiting");
});

joinRoomBtn.addEventListener("click", () => {
  joinCodeInput.value = "";
  joinCodeError.textContent = "";
  showScreen("joinCode");
  joinCodeInput.focus();
});
friendsBackBtn.addEventListener("click", goHome);

/* ---------- Unirse con código ---------- */

const joinCodeInput = document.getElementById("join-code-input");
const joinCodeError = document.getElementById("join-code-error");
const joinCodeCheckBtn = document.getElementById("join-code-check-btn");
const joinCodeBackBtn = document.getElementById("join-code-back-btn");

joinCodeInput.addEventListener("input", () => {
  joinCodeInput.value = joinCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
});
joinCodeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinCodeCheckBtn.click();
});

joinCodeCheckBtn.addEventListener("click", () => {
  const code = joinCodeInput.value.trim();
  if (code.length !== 5) {
    joinCodeError.textContent = "El código debe tener 5 caracteres.";
    return;
  }
  joinCodeError.textContent = "";
  resumeAudio();
  myToken = generateToken();
  myName = readLS("cc1v1_name", "").trim() || "Jugador";
  myAvatar = selectedAvatar;
  socket.emit("join_room", { code, name: myName, avatar: myAvatar, token: myToken });
  waitingText.textContent = "Uniéndote a la sala...";
  showScreen("waiting");
});

joinCodeBackBtn.addEventListener("click", () => showScreen("friends"));

socket.on("join_room_error", ({ message }) => {
  joinCodeError.textContent = message;
  showScreen("joinCode");
});

socket.on("waiting_for_opponent", () => {
  waitingText.textContent = "Buscando rival...";
  showScreen("waiting");
});

/* ---------- Crear partida (código de sala) ---------- */

const roomCodeDisplay = document.getElementById("room-code-display");
const copyCodeBtn = document.getElementById("copy-code-btn");
const copyLinkBtn = document.getElementById("copy-link-btn");
const copyFeedback = document.getElementById("copy-feedback");
const roomCodeCancelBtn = document.getElementById("room-code-cancel-btn");

let currentRoomCode = "";
let copyFeedbackTimeout = null;

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } catch (e2) {
      return;
    }
  }
  copyFeedback.classList.remove("hidden");
  clearTimeout(copyFeedbackTimeout);
  copyFeedbackTimeout = setTimeout(() => copyFeedback.classList.add("hidden"), 2000);
}

copyCodeBtn.addEventListener("click", () => copyText(currentRoomCode));
copyLinkBtn.addEventListener("click", () => {
  const link = `${location.origin}${location.pathname}?room=${currentRoomCode}`;
  copyText(link);
});
roomCodeCancelBtn.addEventListener("click", () => {
  socket.emit("cancel_lobby");
  goHome();
});

socket.on("room_created", ({ code }) => {
  currentRoomCode = code;
  roomCodeDisplay.textContent = code;
  copyFeedback.classList.add("hidden");
  showScreen("roomCode");
});

/* ---------- Selector de modo de juego (Clásico / Caos), compartido ---------- */

let selectedMode = readLS("cc1v1_mode", "classic");
if (!["classic", "chaos"].includes(selectedMode)) selectedMode = "classic";

function refreshModeButtons(buttons, current) {
  buttons.forEach((b) => b.classList.toggle("selected", b.dataset.mode === current));
}

const modePicker = document.getElementById("mode-picker");
const modeButtons = Array.from(modePicker.querySelectorAll(".mode-option"));
refreshModeButtons(modeButtons, selectedMode);

modeButtons.forEach((b) => {
  b.addEventListener("click", () => {
    selectedMode = b.dataset.mode;
    writeLS("cc1v1_mode", selectedMode);
    refreshModeButtons(modeButtons, selectedMode);
  });
});

/* ---------- Sala de amigos (lobby): primero os unís, luego el modo ---------- */

const lobbyYouAvatar = document.getElementById("lobby-you-avatar");
const lobbyYouName = document.getElementById("lobby-you-name");
const lobbyOpponentAvatar = document.getElementById("lobby-opponent-avatar");
const lobbyOpponentName = document.getElementById("lobby-opponent-name");
const lobbyHostControls = document.getElementById("lobby-host-controls");
const lobbyGuestWaiting = document.getElementById("lobby-guest-waiting");
const lobbyConfirmModeBtn = document.getElementById("lobby-confirm-mode-btn");
const lobbyCancelBtn = document.getElementById("lobby-cancel-btn");

const lobbyModePicker = document.getElementById("lobby-mode-picker");
const lobbyModeButtons = Array.from(lobbyModePicker.querySelectorAll(".mode-option"));
let lobbySelectedMode = selectedMode;
refreshModeButtons(lobbyModeButtons, lobbySelectedMode);

lobbyModeButtons.forEach((b) => {
  b.addEventListener("click", () => {
    lobbySelectedMode = b.dataset.mode;
    refreshModeButtons(lobbyModeButtons, lobbySelectedMode);
  });
});

lobbyConfirmModeBtn.addEventListener("click", () => {
  socket.emit("set_lobby_mode", { mode: lobbySelectedMode });
});

lobbyCancelBtn.addEventListener("click", () => {
  socket.emit("cancel_lobby");
  goHome();
});

socket.on("lobby_ready", ({ isHost, opponentName, opponentAvatar }) => {
  lobbyYouAvatar.textContent = myAvatar;
  lobbyYouName.textContent = myName;
  lobbyOpponentAvatar.textContent = opponentAvatar;
  lobbyOpponentName.textContent = opponentName;
  lobbyHostControls.classList.toggle("hidden", !isHost);
  lobbyGuestWaiting.classList.toggle("hidden", isHost);
  if (isHost) {
    lobbySelectedMode = selectedMode;
    refreshModeButtons(lobbyModeButtons, lobbySelectedMode);
  }
  showScreen("lobby");
});

socket.on("lobby_cancelled", ({ message }) => {
  alert(message || "La sala se ha cerrado.");
  goHome();
});

/* ---------- Buscar Rival (emparejamiento aleatorio por modo) ---------- */

const quickmatchError = document.getElementById("quickmatch-error");
const quickmatchSearchBtn = document.getElementById("quickmatch-search-btn");
const quickmatchBackBtn = document.getElementById("quickmatch-back-btn");

quickmatchSearchBtn.addEventListener("click", () => {
  resumeAudio();
  myToken = generateToken();
  myName = readLS("cc1v1_name", "").trim() || "Jugador";
  myAvatar = selectedAvatar;
  socket.emit("join_game", { name: myName, avatar: myAvatar, mode: selectedMode, token: myToken });
  waitingText.textContent = "Buscando rival...";
  showScreen("waiting");
});

quickmatchBackBtn.addEventListener("click", goHome);

socket.on("join_error", ({ message }) => {
  quickmatchError.textContent = message;
  showScreen("quickmatch");
});

/* ---------- Tablero de Conquista de Cajas ---------- */

const SVG_NS = "http://www.w3.org/2000/svg";
const DOT_GRID = 6;
const BOX_GRID = 5;
const CELL = 56;
const PAD = 18;
const BOARD_SIZE = PAD * 2 + CELL * (DOT_GRID - 1);
const POWER_ICONS = { bomb: "💣", multiplier: "⭐", ice: "🧊" };

const waitingText = document.getElementById("waiting-text");
const waitingCancelBtn = document.getElementById("waiting-cancel-btn");
const opponentLabel = document.getElementById("opponent-label");
const scoreLabel = document.getElementById("score-label");
const reconnectBanner = document.getElementById("reconnect-banner");
const turnIndicator = document.getElementById("turn-indicator");
const boardWrap = document.getElementById("board-wrap");
const boardSvg = document.getElementById("board-svg");
const lineError = document.getElementById("line-error");
const gameToast = document.getElementById("game-toast");
const myBoxesAvatar = document.getElementById("my-boxes-avatar");
const opponentBoxesAvatar = document.getElementById("opponent-boxes-avatar");
const myBoxesCount = document.getElementById("my-boxes-count");
const opponentBoxesCount = document.getElementById("opponent-boxes-count");

waitingCancelBtn.addEventListener("click", () => {
  socket.emit("cancel_lobby");
  clearSession();
  goHome();
});

let myToken = "";
let myName = "";
let myAvatar = "";
let currentMode = "classic";
let isMyTurn = false;
let boardInteractive = false;
let matchFinished = false;
let lineEls = {};
let boxEls = {};
let boxLabelEls = {};
let linesState = {};
let boxesState = {};
let gameToastTimeout = null;

function lineKey(type, row, col) {
  return `${type}-${row}-${col}`;
}

function lineCoords(type, row, col) {
  const x1 = PAD + col * CELL;
  const y1 = PAD + row * CELL;
  if (type === "h") return [x1, y1, x1 + CELL, y1];
  return [x1, y1, x1, y1 + CELL];
}

function isValidLine(type, row, col) {
  if (type === "h") return row >= 0 && row < DOT_GRID && col >= 0 && col < BOX_GRID;
  if (type === "v") return row >= 0 && row < BOX_GRID && col >= 0 && col < DOT_GRID;
  return false;
}

function onLineClick(e) {
  if (!boardInteractive) return;
  const { type, row, col } = e.currentTarget.dataset;
  const key = lineKey(type, +row, +col);
  if (linesState[key]) return;
  boardInteractive = false;
  lineError.textContent = "";
  resumeAudio();
  sounds.line();
  socket.emit("draw_line", { type, row: +row, col: +col });
}

function addLine(type, row, col) {
  const [x1, y1, x2, y2] = lineCoords(type, row, col);
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);
  line.setAttribute("class", "board-line");
  line.dataset.type = type;
  line.dataset.row = row;
  line.dataset.col = col;
  line.addEventListener("click", onLineClick);
  boardSvg.appendChild(line);
  lineEls[lineKey(type, row, col)] = line;
}

function buildBoard() {
  boardSvg.innerHTML = "";
  boardSvg.setAttribute("viewBox", `0 0 ${BOARD_SIZE} ${BOARD_SIZE}`);
  lineEls = {};
  boxEls = {};
  boxLabelEls = {};
  linesState = {};
  boxesState = {};

  for (let r = 0; r < BOX_GRID; r++) {
    for (let c = 0; c < BOX_GRID; c++) {
      const x = PAD + c * CELL;
      const y = PAD + r * CELL;

      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", x + 6);
      rect.setAttribute("y", y + 6);
      rect.setAttribute("width", CELL - 12);
      rect.setAttribute("height", CELL - 12);
      rect.setAttribute("rx", 8);
      rect.setAttribute("class", "board-box");
      boardSvg.appendChild(rect);
      boxEls[`${r},${c}`] = rect;

      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", x + CELL / 2);
      label.setAttribute("y", y + CELL / 2);
      label.setAttribute("class", "board-box-label");
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("dominant-baseline", "central");
      boardSvg.appendChild(label);
      boxLabelEls[`${r},${c}`] = label;
    }
  }

  for (let r = 0; r < DOT_GRID; r++) {
    for (let c = 0; c < BOX_GRID; c++) addLine("h", r, c);
  }
  for (let r = 0; r < BOX_GRID; r++) {
    for (let c = 0; c < DOT_GRID; c++) addLine("v", r, c);
  }

  for (let r = 0; r < DOT_GRID; r++) {
    for (let c = 0; c < DOT_GRID; c++) {
      const dot = document.createElementNS(SVG_NS, "circle");
      dot.setAttribute("cx", PAD + c * CELL);
      dot.setAttribute("cy", PAD + r * CELL);
      dot.setAttribute("r", 5);
      dot.setAttribute("class", "board-dot");
      boardSvg.appendChild(dot);
    }
  }
}

function markLineDrawn(line, bySid) {
  const key = lineKey(line.type, line.row, line.col);
  linesState[key] = bySid;
  const el = lineEls[key];
  if (!el) return;
  el.classList.remove("exploding");
  el.classList.add("drawn", bySid === socket.id ? "mine" : "theirs");
}

function removeLine(line) {
  const key = lineKey(line.type, line.row, line.col);
  delete linesState[key];
  const el = lineEls[key];
  if (!el) return;
  el.classList.add("exploding");
  setTimeout(() => {
    el.classList.remove("drawn", "mine", "theirs", "exploding");
  }, 420);
}

function showGameToast(message) {
  gameToast.textContent = message;
  gameToast.classList.remove("hidden");
  void gameToast.offsetWidth;
  gameToast.classList.add("visible");
  clearTimeout(gameToastTimeout);
  gameToastTimeout = setTimeout(() => {
    gameToast.classList.remove("visible");
    setTimeout(() => gameToast.classList.add("hidden"), 250);
  }, 2200);
}

function floatScoreText(row, col, text) {
  const span = document.createElement("span");
  span.className = "float-score";
  span.textContent = text;
  const leftPct = ((PAD + col * CELL + CELL / 2) / BOARD_SIZE) * 100;
  const topPct = ((PAD + row * CELL + CELL / 2) / BOARD_SIZE) * 100;
  span.style.left = leftPct + "%";
  span.style.top = topPct + "%";
  boardWrap.appendChild(span);
  setTimeout(() => span.remove(), 1100);
}

function markBoxClaimed(box, moverSid) {
  const key = `${box.row},${box.col}`;
  boxesState[key] = box;
  const rect = boxEls[key];
  const label = boxLabelEls[key];
  if (!rect) return;
  const mine = moverSid === socket.id;
  rect.classList.add("claimed", mine ? "mine" : "theirs", "pop");
  setTimeout(() => rect.classList.remove("pop"), 400);

  if (box.power && label) {
    label.textContent = POWER_ICONS[box.power] || "";
    label.classList.add("power-icon", "power-pop");
    setTimeout(() => label.classList.remove("power-pop"), 750);
  }
}

function handleCompletedBox(box, moverSid) {
  markBoxClaimed(box, moverSid);
  sounds.box();

  if (box.power === "multiplier") {
    sounds.powerMultiplier();
    floatScoreText(box.row, box.col, `⭐ +${box.points}`);
  } else if (box.power === "bomb") {
    sounds.powerBomb();
    const removed = box.bombRemoved || [];
    removed.forEach((line) => removeLine(line));
    boardWrap.classList.add("shake-board");
    setTimeout(() => boardWrap.classList.remove("shake-board"), 420);
    if (removed.length) {
      showGameToast(moverSid === socket.id ? "💣 ¡Bomba! Destruiste 2 líneas del rival." : "💣 ¡Tu rival ha destruido 2 de tus líneas!");
    }
  } else if (box.power === "ice") {
    sounds.powerIce();
    const targetsMe = box.iceAppliedTo === socket.id;
    showGameToast(targetsMe ? "🧊 ¡Tu próximo turno extra quedará congelado!" : "🧊 ¡Has congelado el próximo turno extra del rival!");
  }
}

function updateBoxScore(you, opponent) {
  myBoxesCount.textContent = you;
  opponentBoxesCount.textContent = opponent;
}

function setTurn(yourTurn, turnSeconds) {
  isMyTurn = yourTurn;
  boardInteractive = yourTurn && !matchFinished;
  boardSvg.classList.toggle("not-my-turn", !boardInteractive);
  turnIndicator.textContent = yourTurn ? "¡Tu turno!" : "Turno del rival";
  turnIndicator.className = "badge " + (yourTurn ? "badge-your-turn" : "badge-opponent-turn");
  if (yourTurn) sounds.yourTurn();
  startTurnTimer(turnSeconds);
}

function resetMatchUI() {
  chatMessagesEl.innerHTML = "";
  lineError.textContent = "";
  reconnectBanner.classList.add("hidden");
  matchFinished = false;
  gameToast.classList.add("hidden");
  myBoxesAvatar.textContent = myAvatar;
  opponentBoxesAvatar.textContent = opponentLabel.dataset.avatar || "🙂";
}

socket.on("match_found", ({ opponentName, opponentAvatar, mode, yourTurn, turnSeconds, boxesYou, boxesOpponent, scoreYou, scoreOpponent }) => {
  currentMode = mode;
  buildBoard();
  opponentLabel.textContent = `${opponentAvatar} ${opponentName}`;
  opponentLabel.dataset.avatar = opponentAvatar;
  updateSessionScoreLabel(scoreYou, scoreOpponent);
  updateBoxScore(boxesYou, boxesOpponent);
  resetMatchUI();
  saveSession();
  sounds.match();
  setTurn(yourTurn, turnSeconds);
  showScreen("game");
});

socket.on("line_error", ({ message }) => {
  lineError.textContent = message;
  boardInteractive = isMyTurn && !matchFinished;
});

socket.on("line_drawn", ({ by, line, completed, yourTurn, turnSeconds, boxesYou, boxesOpponent }) => {
  markLineDrawn(line, by);
  (completed || []).forEach((box) => handleCompletedBox(box, by));
  updateBoxScore(boxesYou, boxesOpponent);
  setTurn(yourTurn, turnSeconds);
});

socket.on("turn_timeout", ({ yourTurn, turnSeconds }) => {
  sounds.timeout();
  setTurn(yourTurn, turnSeconds);
});

/* ---------- Chat ---------- */

const chatMessagesEl = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit("send_chat", { text });
  chatInput.value = "";
});

socket.on("chat_message", ({ by, name, avatar, text }) => {
  const li = document.createElement("li");
  const isOwn = by === socket.id;
  li.className = isOwn ? "own" : "";
  const author = isOwn ? "Tú" : `${avatar} ${name}`;
  const safeText = document.createElement("span");
  safeText.textContent = text;
  li.innerHTML = `<span class="chat-author">${author}</span>`;
  li.appendChild(safeText);
  chatMessagesEl.appendChild(li);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  if (!isOwn) sounds.chat();
});

/* ---------- Pantalla de fin de partida ---------- */

const gameoverTitle = document.getElementById("gameover-title");
const gameoverDetail = document.getElementById("gameover-detail");
const gameoverScore = document.getElementById("gameover-score");
const rematchBtn = document.getElementById("rematch-btn");
const newOpponentBtn = document.getElementById("new-opponent-btn");
const surrenderBtn = document.getElementById("surrender-btn");

function handleGameOver(payload, opts = {}) {
  const { won, draw, boxesYou, boxesOpponent, scoreYou, scoreOpponent, reason, champion } = payload;
  matchFinished = true;
  boardInteractive = false;
  boardSvg.classList.add("not-my-turn");
  stopTurnTimer();
  updateSessionScoreLabel(scoreYou, scoreOpponent);
  updateBoxScore(boxesYou, boxesOpponent);

  gameoverTitle.classList.remove("champion-glow");
  if (champion) {
    gameoverTitle.textContent = won ? "🏆 ¡Eres el campeón de la sesión!" : "🏆 Tu rival es el campeón de la sesión";
    if (won) gameoverTitle.classList.add("champion-glow");
  } else if (reason === "surrender") {
    gameoverTitle.textContent = won ? "🏳️ Tu rival se ha rendido" : "🏳️ Te has rendido";
  } else if (draw) {
    gameoverTitle.textContent = "🤝 ¡Empate!";
  } else {
    gameoverTitle.textContent = won ? "🎉 ¡Has ganado!" : "😔 Has perdido";
  }

  gameoverDetail.textContent = `Cajas conquistadas: Tú ${boxesYou} – Rival ${boxesOpponent}`;
  gameoverScore.textContent = `${champion ? "Marcador final" : "Marcador"}: ${scoreYou} – ${scoreOpponent}`;

  rematchBtn.disabled = false;
  rematchBtn.textContent = "🔁 Jugar otra vez";

  if (!opts.isRejoin) {
    const stats = readStats();
    if (!draw) {
      if (won) stats.wins += 1;
      else stats.losses += 1;
      writeStats(stats);
    }

    if (won) {
      writeCoins(readCoins() + WIN_COINS);
      const streak = readCurrentStreak() + 1;
      writeLS("cc1v1_current_streak", String(streak));
      if (streak > readBestStreak()) writeLS("cc1v1_best_streak", String(streak));
      sounds.win();
      launchConfetti();
    } else if (!draw) {
      writeLS("cc1v1_current_streak", "0");
      sounds.lose();
    }
  }

  showScreen("gameover");
}

socket.on("game_over", (payload) => handleGameOver(payload));

newOpponentBtn.addEventListener("click", () => {
  clearSession();
  goHome();
});

surrenderBtn.addEventListener("click", () => {
  const confirmed = window.confirm("¿Seguro que quieres rendirte? Tu rival ganará la partida.");
  if (confirmed) {
    socket.emit("surrender");
  }
});

/* ---------- Revancha ---------- */

rematchBtn.addEventListener("click", () => {
  resumeAudio();
  rematchBtn.disabled = true;
  rematchBtn.textContent = "Esperando a tu rival...";
  socket.emit("request_rematch");
});

socket.on("rematch_error", ({ message }) => {
  alert(message);
  rematchBtn.disabled = false;
  rematchBtn.textContent = "🔁 Jugar otra vez";
});

socket.on("rematch_waiting", () => {
  rematchBtn.disabled = true;
  rematchBtn.textContent = "Esperando a tu rival...";
});

socket.on("rematch_started", ({ yourTurn, turnSeconds, boxesYou, boxesOpponent, scoreYou, scoreOpponent }) => {
  buildBoard();
  resetMatchUI();
  updateSessionScoreLabel(scoreYou, scoreOpponent);
  updateBoxScore(boxesYou, boxesOpponent);
  saveSession();
  sounds.match();
  setTurn(yourTurn, turnSeconds);
  showScreen("game");
});

/* ---------- Desconexión y reconexión ---------- */

let reconnectCountdownInterval = null;

socket.on("opponent_disconnected", ({ graceSeconds }) => {
  let remaining = graceSeconds;
  clearInterval(reconnectCountdownInterval);
  reconnectBanner.classList.remove("hidden");
  reconnectBanner.textContent = `Tu rival se ha desconectado. Esperando a que vuelva... (${remaining}s)`;
  reconnectCountdownInterval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(reconnectCountdownInterval);
      return;
    }
    reconnectBanner.textContent = `Tu rival se ha desconectado. Esperando a que vuelva... (${remaining}s)`;
  }, 1000);
});

socket.on("opponent_reconnected", () => {
  clearInterval(reconnectCountdownInterval);
  reconnectBanner.classList.add("hidden");
});

socket.on("opponent_left", () => {
  clearInterval(reconnectCountdownInterval);
  clearSession();
  stopTurnTimer();
  matchFinished = true;
  gameoverTitle.classList.remove("champion-glow");
  gameoverTitle.textContent = "Tu rival se ha desconectado";
  gameoverDetail.textContent = "La partida ha finalizado.";
  gameoverScore.textContent = "";
  rematchBtn.disabled = false;
  rematchBtn.textContent = "🔁 Jugar otra vez";
  showScreen("gameover");
});

socket.on("rejoined", (data) => {
  const { opponentName, opponentAvatar, mode, scoreYou, scoreOpponent, boxesYou, boxesOpponent, lines, boxes, state } = data;
  currentMode = mode;
  buildBoard();
  opponentLabel.textContent = `${opponentAvatar} ${opponentName}`;
  opponentLabel.dataset.avatar = opponentAvatar;
  resetMatchUI();

  (lines || []).forEach((line) => markLineDrawn(line, line.by));
  (boxes || []).forEach((box) => markBoxClaimed(box, box.owner));

  updateSessionScoreLabel(scoreYou, scoreOpponent);
  updateBoxScore(boxesYou, boxesOpponent);
  saveSession();

  if (state === "finished") {
    handleGameOver(data, { isRejoin: true });
  } else {
    matchFinished = false;
    setTurn(data.yourTurn, data.turnSeconds);
    showScreen("game");
  }
});

socket.on("rejoin_failed", () => {
  clearSession();
  goHome();
});

/* ---------- Arranque y reconexion automatica ---------- */

function getRoomCodeFromUrl() {
  const params = new URLSearchParams(location.search);
  const code = params.get("room");
  return code ? code.toUpperCase().slice(0, 5) : null;
}

function restoreSessionOrGoHome() {
  let session = null;
  try {
    session = JSON.parse(sessionStorage.getItem("cc1v1_session") || "null");
  } catch (e) {
    session = null;
  }

  if (session && session.token) {
    myToken = session.token;
    myName = session.name;
    myAvatar = session.avatar;
    currentMode = session.mode || "classic";
    waitingText.textContent = "Reconectando con tu partida...";
    showScreen("waiting");
    socket.emit("rejoin", { token: myToken });
    return;
  }

  const urlCode = getRoomCodeFromUrl();
  if (urlCode) {
    history.replaceState({}, "", location.pathname);
    joinCodeInput.value = urlCode;
    joinCodeError.textContent = "";
    resumeAudio();
    myToken = generateToken();
    myName = readLS("cc1v1_name", "").trim() || "Jugador";
    myAvatar = selectedAvatar;
    socket.emit("join_room", { code: urlCode, name: myName, avatar: myAvatar, token: myToken });
    waitingText.textContent = "Uniéndote a la sala...";
    showScreen("waiting");
    return;
  }

  goHome();
}

let hasConnectedBefore = false;

socket.on("connect", () => {
  if (!hasConnectedBefore) {
    hasConnectedBefore = true;
    restoreSessionOrGoHome();
    return;
  }

  /* El socket se ha reconectado solo (wifi intermitente, el movil se ha
     "dormido", un corte breve del proxy del hosting...) sin que la pagina se
     recargara. Sin esto, el servidor nunca se entera de que este cliente es
     el mismo jugador de antes y el rival acaba viendo "se ha desconectado"
     aunque el otro siga ahi jugando. Si teniamos una partida activa, la
     recuperamos sin perder el sitio. */
  if (myToken) {
    stopTurnTimer();
    waitingText.textContent = "Reconectando...";
    showScreen("waiting");
    socket.emit("rejoin", { token: myToken });
  }
});
