const API_BASE = "https://game.sergvolk504.workers.dev";

// Инициализация Telegram WebApp
if (window.Telegram?.WebApp) {
  try {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
  } catch (e) {
    console.warn("Telegram WebApp error:", e);
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[char]));
}

function openExternalLink(url, e) {
  if (e) e.stopPropagation();
  if (!url) return;
  if (window.Telegram?.WebApp?.openLink) {
    window.Telegram.WebApp.openLink(url);
  } else {
    window.open(url, "_blank");
  }
}

let cachedDeals = [];
let cachedNews = [];

const USD_TO_RUB = 95;

function formatPrice(usd) {
  const num = Number(usd);
  if (isNaN(num)) return usd;
  const rub = Math.round(num * USD_TO_RUB);
  return `${rub} ₽ ($${num.toFixed(2)})`;
}

// ==========================================
// 1. ДЕТЕКТОР САНКЦИЙ
// ==========================================
const RESTRICTED_KEYWORDS = [
  "sony", "playstation", "electronic arts", "ea sports", "ubisoft",
  "assassin's", "far cry", "microsoft", "xbox", "forza", "halo",
  "rockstar", "gta", "red dead", "capcom", "resident evil", "monster hunter",
  "square enix", "final fantasy", "sega", "yakuza", "persona", "warner bros",
  "batman", "hogwarts", "bethesda", "fallout", "elder scrolls", "doom",
  "activision", "call of duty", "blizzard", "diablo", "warcraft", "2k", "mafia", "borderlands"
];

function checkSanctions(title, desc) {
  const text = (String(title || "") + " " + String(desc || "")).toLowerCase();
  return RESTRICTED_KEYWORDS.some(kw => text.includes(kw));
}

// ==========================================
// 2. ИЗБРАННОЕ (WATCHLIST)
// ==========================================
function getWatchlist() {
  try { return JSON.parse(localStorage.getItem("game_deals_watchlist") || "[]"); } 
  catch (_) { return []; }
}

function saveWatchlist(list) {
  try { localStorage.setItem("game_deals_watchlist", JSON.stringify(list)); } 
  catch (_) {}
  updateWatchlistBadge();
}

function isFavorite(id) {
  return getWatchlist().some(item => item.id === String(id));
}

function toggleFavorite(gameObj, e) {
  if (e) e.stopPropagation();
  let list = getWatchlist();
  const idStr = String(gameObj.id);

  if (list.some(item => item.id === idStr)) {
    list = list.filter(item => item.id !== idStr);
  } else {
    list.push({
      id: idStr,
      gameId: gameObj.gameId || "",
      steamAppId: gameObj.steamAppId || "",
      title: gameObj.title,
      thumb: gameObj.thumb,
      salePriceUsd: Number(gameObj.salePriceUsd || 0),
      normalPriceUsd: Number(gameObj.normalPriceUsd || 0),
      savingsPct: gameObj.savingsPct || 0,
      steamUrl: gameObj.steamUrl || (gameObj.steamAppId ? `https://store.steampowered.com/app/${gameObj.steamAppId}` : "")
    });
  }

  saveWatchlist(list);
  if (activeTab === "watchlist") renderWatchlist();
  if (activeTab === "deals") applyFiltersAndRender();
}

function updateWatchlistBadge() {
  const countEl = document.getElementById("watchlist-count");
  if (countEl) countEl.textContent = getWatchlist().length;
}

function renderWatchlist() {
  const container = document.getElementById("watchlist-items");
  const summaryBox = document.getElementById("watchlist-summary-box");
  const savingsAmountEl = document.getElementById("summary-savings-amount");
  if (!container) return;

  const list = getWatchlist();

  if (!list.length) {
    if (summaryBox) summaryBox.style.display = "none";
    container.innerHTML = '<div class="empty">В избранном пока пусто. Добавляйте игры по нажатию на сердечко!</div>';
    return;
  }

  let totalSavingsUsd = 0;
  list.forEach(item => {
    totalSavingsUsd += Math.max(0, item.normalPriceUsd - item.salePriceUsd);
  });

  if (summaryBox && savingsAmountEl) {
    summaryBox.style.display = "flex";
    savingsAmountEl.textContent = `${Math.round(totalSavingsUsd * USD_TO_RUB)} ₽ ($${totalSavingsUsd.toFixed(2)})`;
  }

  container.innerHTML = list.map(d => {
    const buyUrl = d.steamUrl || `https://store.steampowered.com/app/${d.steamAppId || ''}`;
    const safeTitle = encodeURIComponent(d.title || "Игра");
    const safeThumb = encodeURIComponent(d.thumb || "");

    return `
      <div class="deal-card" onclick="openGameModal('${d.id}', '${d.gameId}', '${d.steamAppId}', '${d.salePriceUsd}', '${safeTitle}', '${safeThumb}')">
        <img class="deal-thumb" src="${d.thumb}" alt="${escapeHtml(d.title)}" onerror="this.style.display='none'">
        <div class="deal-info">
          <div class="deal-title">${escapeHtml(d.title)}</div>
          <div class="deal-meta">
            <span style="color:var(--accent);">Скидка активна!</span>
          </div>
        </div>
        <div class="deal-pricing">
          <div class="deal-prices">
            <span class="old-price">${formatPrice(d.normalPriceUsd)}</span>
            <span class="new-price">${formatPrice(d.salePriceUsd)}</span>
          </div>
          <button class="quick-buy-btn" onclick="openExternalLink('${buyUrl}', event)">Купить</button>
          <button class="favorite-btn active" onclick="toggleFavorite({ id: '${d.id}' }, event)">❤️</button>
        </div>
      </div>
    `;
  }).join("");
}

// ==========================================
// 3. МОДАЛЬНОЕ ОКНО ДОСЬЕ ИГРЫ
// ==========================================
async function openGameModal(dealId, gameId, steamAppId, currentPriceUsd, titleRaw, thumbRaw) {
  const modal = document.getElementById("game-modal");
  const content = document.getElementById("modal-content");
  if (!modal || !content) return;

  const title = titleRaw ? decodeURIComponent(titleRaw) : "Игра";
  const thumb = thumbRaw ? decodeURIComponent(thumbRaw) : "";

  modal.style.display = "flex";
  
  content.innerHTML = `
    <h2 style="font-family:'Oswald',sans-serif;font-size:20px;margin:0 0 10px;color:#fff;padding-right:30px;">
      ${escapeHtml(title)}
    </h2>
    ${thumb ? `<img src="${escapeHtml(thumb)}" style="width:100%; border-radius:10px; margin-bottom:12px; aspect-ratio:16/9; object-fit:cover;">` : ""}
    <div class="loading">Загружаем трейлер, скриншоты и ссылки на покупку...</div>
  `;

  try {
    const res = await fetch(`${API_BASE}/api/game-details?gameId=${encodeURIComponent(gameId || '')}&steamAppId=${encodeURIComponent(steamAppId || '')}&title=${encodeURIComponent(title)}`);
    const data = await res.json();

    const finalSteamId = steamAppId || "";
    const steamUrl = finalSteamId ? `https://store.steampowered.com/app/${finalSteamId}` : (dealId ? `https://www.cheapshark.com/redirect?dealID=${dealId}` : "https://store.steampowered.com");
    const searchTitle = data.title || title;
    const keysUrl = `https://plati.market/itm/${encodeURIComponent(searchTitle)}`;

    const isRestricted = checkSanctions(data.title, data.shortDesc);

    let html = `
      <h2 style="font-family:'Oswald',sans-serif;font-size:20px;margin:0 0 10px;color:#fff;padding-right:30px;">
        ${escapeHtml(data.title || title)}
      </h2>
    `;

    if (data.trailerVideo) {
      html += `
        <video class="modal-video" controls autoplay muted playsinline>
          <source src="${data.trailerVideo}" type="video/mp4">
        </video>
      `;
    } else if (thumb) {
      html += `<img src="${escapeHtml(thumb)}" style="width:100%; border-radius:10px; margin-bottom:12px; aspect-ratio:16/9; object-fit:cover;">`;
    }

    if (data.screenshots && data.screenshots.length) {
      html += `
        <div class="screenshot-gallery">
          ${data.screenshots.map(s => `<img src="${s}" loading="lazy">`).join("")}
        </div>
      `;
    }

    html += isRestricted 
      ? `<div class="sanction-badge danger">🚫 Недоступно в РФ (Санкции)</div>`
      : `<div class="sanction-badge success">🟢 Доступно в РФ (Можно купить)</div>`;

    html += `
      <div class="lang-badge">
        <span>🌐</span>
        <strong>${data.russianSupport || 'Русский язык уточняется'}</strong>
      </div>
    `;

    const priceDisplay = currentPriceUsd && currentPriceUsd !== "undefined" ? ` — ${formatPrice(currentPriceUsd)}` : "";
    
    html += `
      <div class="modal-actions-box">
        <button class="modal-primary-buy-btn" onclick="openExternalLink('${steamUrl}', event)">
          <span>🛒 КУПИТЬ В STEAM${priceDisplay}</span>
        </button>
        <button class="modal-keys-btn" onclick="openExternalLink('${keysUrl}', event)">
          <span>🔑 Найти ключ дешевле (Plati / Габестор)</span>
        </button>
      </div>
    `;

    if (data.shortDesc) {
      html += `<p style="font-size:12px;color:var(--text-dim);line-height:1.4;margin:0 0 14px;">${escapeHtml(data.shortDesc)}</p>`;
    }

    if (data.cheapestEverUsd) {
      html += `
        <div style="font-size:11px;color:#f59e0b;font-family:'Roboto Mono',monospace;margin-bottom:12px;">
          📉 Исторический минимум цены: ${formatPrice(data.cheapestEverUsd)}
        </div>
      `;
    }

    if (data.prices && data.prices.length) {
      html += `
        <div style="font-family:'Oswald',sans-serif;font-size:13px;color:var(--text-dim);text-transform:uppercase;margin-bottom:6px;">
          Цены в других магазинах:
        </div>
        <div class="stores-list">
          ${data.prices.map(p => `
            <div class="store-row" onclick="openExternalLink('${p.dealUrl}', event)">
              <span class="store-name">${escapeHtml(p.storeName)}</span>
              <div style="display:flex;align-items:center;gap:8px;">
                ${p.savingsPct > 0 ? `<span class="deal-discount-badge">-${p.savingsPct}%</span>` : ''}
                <span class="store-price">${formatPrice(p.salePriceUsd)}</span>
              </div>
            </div>
          `).join("")}
        </div>
      `;
    }

    content.innerHTML = html;
  } catch (err) {
    content.innerHTML += `
      <div class="empty">Не удалось подгрузить полное досье.</div>
      <div class="modal-actions-box">
        <button class="modal-primary-buy-btn" onclick="openExternalLink('https://store.steampowered.com/app/${steamAppId}', event)">
          <span>🛒 ИСКАТЬ В STEAM</span>
        </button>
      </div>
    `;
  }
}

// ==========================================
// 4. ТАБЫ И ЗАГРУЗКА СПИСКОВ
// ==========================================
function switchTab(tab) {
  activeTab = tab;
  ["giveaways", "deals", "search", "watchlist", "news"].forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    const view = document.getElementById(`view-${t}`);
    if (btn) btn.classList.toggle("active", t === tab);
    if (view) view.style.display = (t === tab) ? "" : "none";
  });

  if (tab === "giveaways") loadGiveaways();
  if (tab === "deals") loadDeals();
  if (tab === "watchlist") renderWatchlist();
  if (tab === "news") loadNews();
}

async function loadNews() {
  const container = document.getElementById("news-list");
  if (!container) return;
  if (container.innerHTML.includes("news-card")) return;

  container.innerHTML = '<div class="loading">Читаем свежие новости...</div>';

  try {
    const res = await fetch(`${API_BASE}/api/news`);
    const data = await res.json();
    cachedNews = data.items || [];
    
    if (!cachedNews.length) {
      container.innerHTML = '<div class="empty">Не удалось найти свежие новости.</div>';
      return;
    }

    container.innerHTML = cachedNews.map((news, index) => {
      let dateStr = "Сегодня";
      try {
        const d = new Date(news.pubDate);
        if (!isNaN(d.getTime())) {
          dateStr = d.toLocaleString("ru-RU", { day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit' });
        }
      } catch (_) {}

      // Клик теперь вызывает окно openNewsModal вместо внешней ссылки
      return `
        <div class="news-card" onclick="openNewsModal(${index})">
          <img class="news-thumb" src="${news.thumbnail}" alt="news" onerror="this.src='https://via.placeholder.com/600x338?text=Gaming+News'">
          <div class="news-info">
            <h3 class="news-title">${escapeHtml(news.title)}</h3>
            <div class="news-date">🕒 ${dateStr}</div>
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    container.innerHTML = '<div class="empty">Ошибка загрузки новостей</div>';
  }
}

// Открытие статьи во всплывающем окне прямо в приложении (мгновенно, без задержек)
function openNewsModal(index) {
  const news = cachedNews[index];
  if (!news) return;

  const modal = document.getElementById("news-modal");
  const content = document.getElementById("news-modal-content");
  if (!modal || !content) return;

  let dateStr = "Сегодня";
  try {
    const d = new Date(news.pubDate);
    if (!isNaN(d.getTime())) {
      dateStr = d.toLocaleString("ru-RU", { day: 'numeric', month: 'long', hour: '2-digit', minute:'2-digit' });
    }
  } catch (_) {}

  // Мгновенно выводим заголовок, картинку и ПОЛНЫЙ текст всех абзацев
  content.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-right:30px;">
      <span style="font-size:11px;color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:.05em;">✍️ РЕДАКЦИЯ GAME DEALS</span>
      <span style="font-size:11px;color:var(--text-dim);">🕒 ${dateStr}</span>
    </div>

    <h2 style="font-family:'Oswald',sans-serif;font-size:20px;margin:0 0 12px;color:#fff;line-height:1.3;">
      ${escapeHtml(news.title)}
    </h2>
    
    ${news.thumbnail ? `<img src="${news.thumbnail}" style="width:100%; border-radius:10px; margin-bottom:14px; aspect-ratio:16/9; object-fit:cover;">` : ''}

    <div class="news-modal-text">
      ${news.fullText || `<p>${escapeHtml(news.description || 'Текст новости формируется.')}</p>`}
    </div>

    <div class="modal-actions-box" style="margin-top:14px;">
      <button class="modal-primary-buy-btn" onclick="document.getElementById('news-modal').style.display='none'">
        ✕ ЗАКРЫТЬ СТАТЬЮ
      </button>
    </div>
  `;

  modal.style.display = "flex";
}

async function loadGiveaways() {
  const activeContainer = document.getElementById("active-giveaways-list");
  const upcomingContainer = document.getElementById("upcoming-giveaways-list");
  if (!activeContainer || !upcomingContainer) return;

  let data = { active: [], upcoming: [] };
  try {
    const res = await fetch(`${API_BASE}/api/giveaways`);
    data = await res.json();
  } catch (err) {
    activeContainer.innerHTML = '<div class="empty">Сервер раздач временно недоступен</div>';
    return;
  }

  const activeList = data.active || [];
  const upcomingList = data.upcoming || [];

  // Если прямо сейчас нет активных раздач в EGS
  if (!activeList.length) {
    activeContainer.innerHTML = '<div class="empty">Прямо сейчас раздача завершилась. Следующая игра откроется в четверг!</div>';
  } else {
    activeContainer.innerHTML = activeList.map(game => `
      <div class="giveaway-card">
        <img class="giveaway-img" src="${game.image}" alt="${escapeHtml(game.title)}" onerror="this.src='https://via.placeholder.com/600x338?text=Free+Game'">
        <div class="giveaway-body">
          <h3 class="giveaway-title">${escapeHtml(game.title)}</h3>
          <div class="giveaway-desc">${escapeHtml(game.description || "Бесплатная раздача игры")}</div>
          <div class="giveaway-footer">
            <div class="giveaway-timer" data-end-time="${game.endDate || ''}">Загрузка таймера...</div>
            <button class="claim-btn" onclick="openExternalLink('${game.storeUrl}', event)">Забрать (0₽)</button>
          </div>
        </div>
      </div>
    `).join("");
  }

  if (!upcomingList.length) {
    upcomingContainer.innerHTML = '<div class="empty">Анонсов следующих раздач пока нет</div>';
  } else {
    upcomingContainer.innerHTML = upcomingList.map(game => {
      let dateStr = "Скоро";
      try {
        const d = new Date(game.startDate);
        if (!isNaN(d.getTime())) dateStr = d.toLocaleDateString("ru-RU");
      } catch (_) {}

      return `
        <div class="giveaway-card" style="opacity:0.85;">
          <img class="giveaway-img" src="${game.image}" alt="${escapeHtml(game.title)}" onerror="this.src='https://via.placeholder.com/600x338?text=Upcoming+Game'">
          <div class="giveaway-body">
            <h3 class="giveaway-title">${escapeHtml(game.title)}</h3>
            <div class="giveaway-desc">${escapeHtml(game.description || "Скоро на раздаче")}</div>
            <div class="giveaway-footer">
              <span style="font-size:11px;color:var(--text-dim);">Старт: ${dateStr}</span>
              <span class="badge-free">СКОРО</span>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  try { startTimers(); } catch (_) {}
}

function startTimers() {
  if (countdownInterval) clearInterval(countdownInterval);

  function update() {
    document.querySelectorAll(".giveaway-timer[data-end-time]").forEach(el => {
      const end = new Date(el.dataset.endTime).getTime();
      const diff = end - Date.now();

      if (diff <= 0) {
        el.textContent = "Раздача завершена";
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      el.textContent = `⏳ Осталось: ${days}д ${hours}ч ${minutes}м ${seconds}с`;
    });
  }

  update();
  countdownInterval = setInterval(update, 1000);
}

// 5. ТЕМАТИЧЕСКИЕ ПОДБОРКИ И ФИЛЬТРЫ (Расширенные словари)
function applyFiltersAndRender() {
  let filtered = [...cachedDeals];

  if (currentCollection === "cheap") {
    filtered = filtered.filter(d => (Number(d.salePriceUsd) * USD_TO_RUB) <= 300);
  } 
  else if (currentCollection === "coop") {
    const kws = [
      "co-op", "coop", "multiplayer", "party", "takes two", "overcooked", "portal", 
      "left 4 dead", "helldivers", "payday", "borderlands", "halo", "don't starve", 
      "lethal company", "phasmophobia", "sea of thieves", "a way out", "golf", 
      "human fall flat", "rainbow six", "ghost recon", "division", "destiny", "warframe", "remnant"
    ];
    filtered = filtered.filter(d => kws.some(kw => d.title.toLowerCase().includes(kw)));
  } 
  else if (currentCollection === "rpg") {
    const kws = [
      "rpg", "witcher", "cyberpunk", "fallout", "elder scrolls", "skyrim", "dragon", 
      "fantasy", "persona", "yakuza", "tales", "baldur", "mass effect", "souls", "elden", 
      "bloodborne", "sekiro", "nioh", "diablo", "path of exile", "grim dawn", "final fantasy", 
      "gothic", "risen", "elex", "kingdom come", "starfield", "outer worlds", "monster hunter"
    ];
    filtered = filtered.filter(d => kws.some(kw => d.title.toLowerCase().includes(kw)));
  } 
  else if (currentCollection === "horror") {
    const kws = [
      "horror", "resident evil", "silent hill", "outlast", "amnesia", "dead space", 
      "fear", "zombie", "evil within", "fnaf", "alien", "alone in the dark", "alan wake", 
      "soma", "layers of fear", "phasmophobia", "lethal company", "texas", "dead by daylight", 
      "call of cthulhu", "vampyr", "dying light", "left 4 dead"
    ];
    filtered = filtered.filter(d => kws.some(kw => d.title.toLowerCase().includes(kw)));
  } 
  else if (currentCollection === "action") {
    const kws = [
      "action", "shooter", "call of duty", "doom", "battlefield", "gta", "red dead", 
      "assassin", "far cry", "batman", "spider-man", "god of war", "uncharted", "tomb raider", 
      "horizon", "days gone", "ghost of tsushima", "devil may cry", "bayonetta", "metal gear", 
      "hitman", "sniper", "crysis", "wolfenstein", "gears", "max payne", "control", "bioshock", 
      "dishonored", "mafia", "watch dogs", "just cause", "saints row"
    ];
    filtered = filtered.filter(d => kws.some(kw => d.title.toLowerCase().includes(kw)));
  }

  if (currentSort === "Savings") {
    filtered.sort((a, b) => b.savingsPct - a.savingsPct);
  } else if (currentSort === "Price") {
    filtered.sort((a, b) => Number(a.salePriceUsd) - Number(b.salePriceUsd));
  } else if (currentSort === "Metacritic") {
    filtered.sort((a, b) => Number(b.metacriticScore || 0) - Number(a.metacriticScore || 0));
  }

  renderDealsList(filtered);
}

function renderDealsList(deals) {
  const container = document.getElementById("deals-list");
  if (!container) return;

  if (!deals.length) {
    container.innerHTML = '<div class="empty">В этой категории пока пусто. Попробуйте другой фильтр или обновите позже.</div>';
    return;
  }

  container.innerHTML = deals.map(d => {
    const isFav = isFavorite(d.dealId);
    const buyUrl = d.steamUrl || `https://store.steampowered.com/app/${d.steamAppId || ''}`;
    
    const safeTitle = encodeURIComponent(d.title || "");
    const safeThumb = encodeURIComponent(d.thumb || "");
    const safeObj = encodeURIComponent(JSON.stringify({
      id: d.dealId,
      gameId: d.gameId,
      steamAppId: d.steamAppId,
      title: d.title,
      thumb: d.thumb,
      salePriceUsd: d.salePriceUsd,
      normalPriceUsd: d.normalPriceUsd,
      savingsPct: d.savingsPct,
      steamUrl: buyUrl
    }));

    return `
      <div class="deal-card" onclick="openGameModal('${d.dealId}', '${d.gameId || ''}', '${d.steamAppId || ''}', '${d.salePriceUsd}', '${safeTitle}', '${safeThumb}')">
        <img class="deal-thumb" src="${d.thumb}" alt="${escapeHtml(d.title)}" onerror="this.style.display='none'">
        <div class="deal-info">
          <div class="deal-title">${escapeHtml(d.title)}</div>
          <div class="deal-meta">
            ${d.savingsPct > 0 ? `<span class="deal-discount-badge">-${d.savingsPct}%</span>` : ''}
            ${d.steamRatingPercent ? `<span>👍 ${d.steamRatingPercent}%</span>` : ''}
            ${d.metacriticScore ? `<span>🏆 MC: ${d.metacriticScore}</span>` : ''}
          </div>
        </div>
        <div class="deal-pricing">
          <div class="deal-prices">
            <span class="old-price">${formatPrice(d.normalPriceUsd)}</span>
            <span class="new-price">${formatPrice(d.salePriceUsd)}</span>
          </div>
          <button class="quick-buy-btn" onclick="openExternalLink('${buyUrl}', event)">Купить</button>
          <button class="favorite-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite(JSON.parse(decodeURIComponent('${safeObj}')), event)">
            ${isFav ? '❤️' : '🤍'}
          </button>
        </div>
      </div>
    `;
  }).join("");
}

async function loadDeals(showLoader = true) {
  const container = document.getElementById("deals-list");
  if (!container) return;
  if (showLoader) container.innerHTML = '<div class="loading">Загружаем скидки из Steam...</div>';

  let data = { deals: [] };
  try {
    const res = await fetch(`${API_BASE}/api/deals`);
    data = await res.json();
  } catch (err) {
    container.innerHTML = '<div class="empty">Не удалось связаться с сервером скидок</div>';
    return;
  }

  cachedDeals = data.deals || [];
  try {
    applyFiltersAndRender();
  } catch (renderError) {
    console.warn("Ошибка отрисовки:", renderError);
  }
}

async function handleSearch() {
  const input = document.getElementById("search-input");
  const query = input?.value?.trim();
  const container = document.getElementById("search-results-list");

  if (!query || !container) return;
  container.innerHTML = '<div class="loading">Ищем лучшую цену...</div>';

  try {
    const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    const results = data.results || [];

    if (!results.length) {
      container.innerHTML = `<div class="empty">По запросу «${escapeHtml(query)}» ничего не найдено</div>`;
      return;
    }

    container.innerHTML = results.map(g => {
      const buyUrl = g.steamAppId ? `https://store.steampowered.com/app/${g.steamAppId}` : "https://store.steampowered.com";
      const safeTitle = encodeURIComponent(g.title || "");
      const safeThumb = encodeURIComponent(g.thumb || "");
      
      return `
        <div class="deal-card" onclick="openGameModal('${g.cheapestDealId || ''}', '${g.gameId || ''}', '${g.steamAppId || ''}', '${g.cheapestPriceUsd}', '${safeTitle}', '${safeThumb}')">
          <img class="deal-thumb" src="${g.thumb}" alt="${escapeHtml(g.title)}" onerror="this.style.display='none'">
          <div class="deal-info">
            <div class="deal-title">${escapeHtml(g.title)}</div>
            <div class="deal-meta"><span>Нажмите для сравнения цен</span></div>
          </div>
          <div class="deal-pricing">
            <span class="new-price">${formatPrice(g.cheapestPriceUsd)}</span>
            <button class="quick-buy-btn" onclick="openExternalLink('${buyUrl}', event)">Купить</button>
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    container.innerHTML = '<div class="empty">Ошибка поиска</div>';
  }
}

// ==========================================
// 6. ИНИЦИАЛИЗАЦИЯ И СЛУШАТЕЛИ
// ==========================================
function init() {
  updateWatchlistBadge();

  // Логика калькулятора пополнения
  const calcModal = document.getElementById("calc-modal");
  const openCalcBtn = document.getElementById("open-calc-btn");
  const closeCalcBtn = document.getElementById("close-calc-btn");
  const calcInput = document.getElementById("calc-input");
  const calcResult = document.getElementById("calc-result");
  const calcSymbol = document.getElementById("calc-currency-symbol");
  let calcRegion = "RU"; 

  function updateCalc() {
    const val = Number(calcInput.value) || 0;
    const finalAmount = Math.round(val * 1.15); // +15% комиссии
    calcResult.textContent = calcRegion === "RU" ? `${finalAmount} ₽` : `${finalAmount} ₸`;
  }

  if (openCalcBtn) openCalcBtn.onclick = () => { if (calcModal) calcModal.style.display = "flex"; };
  if (closeCalcBtn) closeCalcBtn.onclick = () => { if (calcModal) calcModal.style.display = "none"; };
  if (calcInput) calcInput.oninput = updateCalc;

  document.querySelectorAll(".calc-region-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".calc-region-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      calcRegion = btn.dataset.region;
      if (calcSymbol) calcSymbol.textContent = calcRegion === "RU" ? "₽" : "₸";
      updateCalc();
    };
  });

  document.getElementById("calc-pay-btn")?.addEventListener("click", () => {
    openExternalLink("https://store.steampowered.com"); 
  });

  document.getElementById("tab-giveaways")?.addEventListener("click", () => switchTab("giveaways"));
  document.getElementById("tab-deals")?.addEventListener("click", () => switchTab("deals"));
  document.getElementById("tab-news")?.addEventListener("click", () => switchTab("news"));
  document.getElementById("tab-search")?.addEventListener("click", () => switchTab("search"));
  document.getElementById("tab-watchlist")?.addEventListener("click", () => switchTab("watchlist"));

  document.querySelectorAll(".collections-bar button").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".collections-bar button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentCollection = btn.dataset.col;
      applyFiltersAndRender();
    };
  });

  document.querySelectorAll(".deals-filter-bar button").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".deals-filter-bar button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentSort = btn.dataset.sort;
      applyFiltersAndRender();
    };
  });

  document.getElementById("search-btn")?.addEventListener("click", handleSearch);
  document.getElementById("search-input")?.addEventListener("keydown", e => {
    if (e.key === "Enter") handleSearch();
  });

  document.getElementById("close-modal-btn")?.addEventListener("click", () => {
    const modal = document.getElementById("game-modal");
    if (modal) {
      modal.style.display = "none";
      const video = modal.querySelector("video");
      if (video) video.pause();
    }
  });

  document.getElementById("game-modal")?.addEventListener("click", e => {
    if (e.target.id === "game-modal") {
      e.target.style.display = "none";
      const video = e.target.querySelector("video");
      if (video) video.pause();
    }
  });

  // Закрытие модального окна новости
  document.getElementById("close-news-modal-btn")?.addEventListener("click", () => {
    const modal = document.getElementById("news-modal");
    if (modal) modal.style.display = "none";
  });

  document.getElementById("news-modal")?.addEventListener("click", e => {
    if (e.target.id === "news-modal") {
      e.target.style.display = "none";
    }
  });

  document.getElementById("game-modal")?.addEventListener("click", e => {
    if (e.target.id === "game-modal") {
      e.target.style.display = "none";
      const video = e.target.querySelector("video");
      if (video) video.pause();
    }
  });

  document.getElementById("calc-modal")?.addEventListener("click", e => {
    if (e.target.id === "calc-modal") e.target.style.display = "none";
  });

  document.getElementById("share-watchlist-btn")?.addEventListener("click", () => {
    const list = getWatchlist();
    if (!list.length) return;
    const titles = list.slice(0, 3).map(i => `• ${i.title}`).join("%0A");
    const text = encodeURIComponent(`Смотри, сколько я сэкономил на распродаже игр:%0A${decodeURIComponent(titles)}%0Aи другие со скидками до 90%!`);
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${text}`;
    openExternalLink(shareUrl);
  });

  switchTab("giveaways");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
