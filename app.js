const API_BASE = "https://game.sergvolk504.workers.dev";

if (window.Telegram?.WebApp) {
  try {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
  } catch (e) {}
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[char]));
}

function sanitizeRichHtml(html) {
  return String(html ?? "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "")
    .replace(/on\w+='[^']*'/gi, "");
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

let activeTab = "giveaways";
let currentSort = "DealRating";
let currentCollection = "all";
let countdownInterval = null;
let cachedDeals = [];
let cachedNews = [];

const USD_TO_RUB = 95;

function formatPrice(usd) {
  const num = Number(usd);
  if (isNaN(num)) return usd;
  const rub = Math.round(num * USD_TO_RUB);
  return `${rub} ₽ ($${num.toFixed(2)})`;
}

// 1. ДЕТЕКТОР РЕГИОНАЛЬНЫХ ОГРАНИЧЕНИЙ (БЕЗ ЛОЖНОЙ КАТЕГОРИЧНОСТИ)
const RESTRICTED_PUBLISHERS = [
  "sony", "playstation", "electronic arts", "ea sports", "ubisoft",
  "assassin's", "far cry", "microsoft", "xbox", "forza", "halo",
  "rockstar", "gta", "red dead", "capcom", "resident evil", "monster hunter",
  "square enix", "final fantasy", "sega", "yakuza", "persona", "warner bros",
  "batman", "hogwarts", "bethesda", "fallout", "elder scrolls", "doom",
  "activision", "call of duty", "blizzard", "diablo", "2k", "mafia", "borderlands"
];

function checkSanctions(title) {
  const text = String(title || "").toLowerCase();
  return RESTRICTED_PUBLISHERS.some(kw => text.includes(kw));
}

// 2. ИЗБРАННОЕ (ПОЛНОЕ СОХРАНЕНИЕ ВСЕХ ПАРАМЕТРОВ)
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
  return getWatchlist().some(item => String(item.id) === String(id));
}

function toggleFavorite(gameObj, e) {
  if (e) e.stopPropagation();
  let list = getWatchlist();
  const idStr = String(gameObj.id || gameObj.dealId);

  if (list.some(item => item.id === idStr)) {
    list = list.filter(item => item.id !== idStr);
  } else {
    list.push({
      id: idStr,
      gameId: String(gameObj.gameId || ""),
      steamAppId: String(gameObj.steamAppId || ""),
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
    const buyUrl = d.steamUrl || (d.steamAppId ? `https://store.steampowered.com/app/${d.steamAppId}` : "https://store.steampowered.com");
    const safeTitle = encodeURIComponent(d.title || "Игра");
    const safeThumb = encodeURIComponent(d.thumb || "");

    return `
      <div class="deal-card" onclick="openGameModal('${d.id}', '${d.gameId}', '${d.steamAppId}', '${d.salePriceUsd}', '${safeTitle}', '${safeThumb}')">
        <img class="deal-thumb" src="${d.thumb}" alt="${escapeHtml(d.title)}" onerror="this.style.display='none'">
        <div class="deal-info">
          <div class="deal-title">${escapeHtml(d.title)}</div>
          <div class="deal-meta">
            ${d.savingsPct > 0 ? `<span class="deal-discount-badge">-${d.savingsPct}%</span>` : ''}
            <span style="color:var(--accent);">В списке отслеживания</span>
          </div>
        </div>
        <div class="deal-pricing">
          <div class="deal-prices">
            <span class="old-price">${formatPrice(d.normalPriceUsd)}</span>
            <span class="new-price">${formatPrice(d.salePriceUsd)}</span>
          </div>
          <button class="quick-buy-btn" onclick="openExternalLink('${buyUrl}', event)">В Steam</button>
          <button class="favorite-btn active" onclick="toggleFavorite({ id: '${d.id}' }, event)">❤️</button>
        </div>
      </div>
    `;
  }).join("");
}

// 3. ДОСЬЕ ИГРЫ (С ИСТОРИЧЕСКИМ МИНИМУМОМ И ЯЗЫКОМ)
async function openGameModal(dealId, gameId, steamAppId, currentPriceUsd, titleRaw, thumbRaw) {
  const modal = document.getElementById("game-modal");
  const content = document.getElementById("modal-content");
  if (!modal || !content) return;

  const title = titleRaw ? decodeURIComponent(titleRaw) : "Игра";
  const thumb = thumbRaw ? decodeURIComponent(thumbRaw) : "";

  modal.style.display = "flex";

  const finalSteamId = (steamAppId && steamAppId !== "null" && steamAppId !== "undefined") ? steamAppId : "";
  const steamUrl = finalSteamId 
    ? `https://store.steampowered.com/app/${finalSteamId}` 
    : (dealId ? `https://www.cheapshark.com/redirect?dealID=${dealId}` : `https://store.steampowered.com/search/?term=${encodeURIComponent(title)}`);
  
  const keysUrl = `https://plati.market/itm/${encodeURIComponent(title)}`;
  const priceDisplay = currentPriceUsd && currentPriceUsd !== "undefined" ? ` — ${formatPrice(currentPriceUsd)}` : "";
  const mightBeRestricted = checkSanctions(title);

  content.innerHTML = `
    <h2 style="font-family:'Oswald',sans-serif;font-size:20px;margin:0 0 10px;color:#fff;padding-right:30px;">
      ${escapeHtml(title)}
    </h2>

    <div id="modal-media-box">
      ${thumb ? `<img src="${escapeHtml(thumb)}" style="width:100%; border-radius:10px; margin-bottom:12px; aspect-ratio:16/9; object-fit:cover;">` : ""}
    </div>

    ${mightBeRestricted 
      ? `<div class="sanction-badge danger">⚠️ Возможны ограничения в РФ (Издатель ушел с рынка)</div>`
      : `<div class="sanction-badge success">ℹ️ Прямых ограничений не выявлено (Проверяйте в Steam)</div>`}

    <div class="lang-badge">
      <span>🌐</span>
      <strong id="modal-lang-text">Определяем наличие русского языка...</strong>
    </div>

    <div id="modal-hist-box" class="lang-badge" style="display:none;background:rgba(245,158,11,0.15);color:#f59e0b;border-color:rgba(245,158,11,0.3);">
      <span>📉 Исторический минимум:</span>
      <strong id="modal-hist-text">-</strong>
    </div>

    <div class="modal-actions-box">
      <button class="modal-primary-buy-btn" onclick="openExternalLink('${steamUrl}', event)">
        <span>🛒 СТРАНИЦА В STEAM${priceDisplay}</span>
      </button>
      <button class="modal-keys-btn" onclick="openExternalLink('${keysUrl}', event)">
        <span>🔑 Найти ключ на Plati / Маркетах</span>
      </button>
    </div>

    <div id="modal-desc-box">
      <div class="loading" style="padding:10px 0;font-size:12px;">Загружаем трейлер и описание...</div>
    </div>
  `;

  try {
    const res = await fetch(`${API_BASE}/api/game-details?gameId=${encodeURIComponent(gameId || '')}&steamAppId=${encodeURIComponent(finalSteamId)}&title=${encodeURIComponent(title)}`);
    const data = await res.json();

    const mediaBox = document.getElementById("modal-media-box");
    const descBox = document.getElementById("modal-desc-box");
    const langText = document.getElementById("modal-lang-text");
    const histBox = document.getElementById("modal-hist-box");
    const histText = document.getElementById("modal-hist-text");

    if (langText && data.russianSupport) {
      langText.textContent = data.russianSupport;
    }

    if (histBox && histText && data.historicalLowUsd) {
      histBox.style.display = "inline-flex";
      histText.textContent = formatPrice(data.historicalLowUsd);
    }

    if (mediaBox && data.trailerVideo) {
      mediaBox.innerHTML = `
        <video class="modal-video" controls autoplay muted playsinline>
          <source src="${data.trailerVideo}" type="video/mp4">
        </video>
      `;
    }

    if (descBox) {
      let extraHtml = "";
      if (data.screenshots && data.screenshots.length) {
        extraHtml += `
          <div class="screenshot-gallery">
            ${data.screenshots.map(s => `<img src="${s}" loading="lazy">`).join("")}
          </div>
        `;
      }
      if (data.shortDesc) {
        extraHtml += `<p style="font-size:12px;color:var(--text-dim);line-height:1.4;margin:10px 0;">${escapeHtml(data.shortDesc)}</p>`;
      }
      descBox.innerHTML = extraHtml;
    }
  } catch (_) {
    const descBox = document.getElementById("modal-desc-box");
    if (descBox) descBox.innerHTML = "";
  }
}

// 4. ОКНО НОВОСТЕЙ С УКАЗАНИЕМ ИСТОЧНИКА
async function openNewsModal(index) {
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

  modal.style.display = "flex";
  const sourceName = news.sourceName || "Игровые новости";
  const initialText = news.fullText || news.description || 'Текст новости формируется.';

  content.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-right:30px;">
      <span style="font-size:11px;color:var(--accent);font-weight:700;text-transform:uppercase;">📌 ИСТОЧНИК: ${escapeHtml(sourceName)}</span>
      <span style="font-size:11px;color:var(--text-dim);">🕒 ${dateStr}</span>
    </div>

    <h2 style="font-family:'Oswald',sans-serif;font-size:20px;margin:0 0 12px;color:#fff;line-height:1.3;">
      ${escapeHtml(news.title)}
    </h2>
    
    ${news.thumbnail ? `<img src="${news.thumbnail}" style="width:100%; border-radius:10px; margin-bottom:14px; aspect-ratio:16/9; object-fit:cover;">` : ''}

    <div id="full-news-body" class="news-modal-text">
      ${sanitizeRichHtml(initialText.startsWith('<p>') ? initialText : `<p>${initialText}</p>`)}
    </div>

    <div class="modal-actions-box" style="margin-top:14px;">
      <button class="modal-keys-btn" onclick="openExternalLink('${news.link}', event)">
        ↗ Читать оригинал на ${escapeHtml(sourceName)}
      </button>
      <button class="modal-primary-buy-btn" style="background:#242f42;color:#fff;" onclick="document.getElementById('news-modal').style.display='none'">
        ✕ Закрыть
      </button>
    </div>
  `;

  // Догрузка абзацев статьи
  const plainTextLength = initialText.replace(/<[^>]+>/g, "").trim().length;
  if (plainTextLength < 350 && news.link) {
    try {
      const res = await fetch(`${API_BASE}/api/news-details?url=${encodeURIComponent(news.link)}`);
      const data = await res.json();
      const bodyEl = document.getElementById("full-news-body");
      if (bodyEl && data.content && data.content.length > 50) {
        bodyEl.innerHTML = sanitizeRichHtml(data.content);
      }
    } catch (_) {}
  }
}

// 5. ТАБЫ И ЗАГРУЗКА
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

async function loadGiveaways() {
  const activeContainer = document.getElementById("active-giveaways-list");
  const upcomingContainer = document.getElementById("upcoming-giveaways-list");
  if (!activeContainer || !upcomingContainer) return;

  let data = { active: [], upcoming: [] };
  try {
    const res = await fetch(`${API_BASE}/api/giveaways`);
    data = await res.json();
  } catch (err) {
    activeContainer.innerHTML = '<div class="empty">Не удалось связаться с сервером раздач</div>';
    return;
  }

  const activeList = data.active || [];
  const upcomingList = data.upcoming || [];

  if (!activeList.length) {
    activeContainer.innerHTML = '<div class="empty">Активных раздач прямо сейчас нет. Новые появятся скоро!</div>';
  } else {
    activeContainer.innerHTML = activeList.map(game => `
      <div class="giveaway-card">
        <img class="giveaway-img" src="${game.image}" alt="${escapeHtml(game.title)}" onerror="this.src='https://via.placeholder.com/600x338?text=Free+Game'">
        <div class="giveaway-body">
          <h3 class="giveaway-title">${escapeHtml(game.title)}</h3>
          <div class="giveaway-desc">${escapeHtml(game.description || "Бесплатная раздача игры")}</div>
          <div class="giveaway-footer">
            <div class="giveaway-timer" data-end-time="${game.endDate || ''}">Срок уточняется</div>
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

  startTimers();
}

function startTimers() {
  if (countdownInterval) clearInterval(countdownInterval);

  function update() {
    document.querySelectorAll(".giveaway-timer").forEach(el => {
      const rawEnd = el.getAttribute("data-end-time");
      if (!rawEnd) {
        el.textContent = "⏳ До окончания акции";
        return;
      }

      const end = new Date(rawEnd).getTime();
      if (isNaN(end)) {
        el.textContent = "⏳ До окончания акции";
        return;
      }

      const diff = end - Date.now();
      if (diff <= 0) {
        el.textContent = "Раздача завершена";
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % 1000) / 1000);

      el.textContent = `⏳ ${days}д ${hours}ч ${minutes}м ${seconds}с`;
    });
  }

  update();
  countdownInterval = setInterval(update, 1000);
}

// 6. ТЕМАТИЧЕСКИЕ ПОДБОРКИ И СОРТИРОВКА (С ПОДДЕРЖКОЙ DEALRATING)
function applyFiltersAndRender() {
  let filtered = [...cachedDeals];

  if (currentCollection === "cheap") {
    filtered = filtered.filter(d => (Number(d.salePriceUsd) * USD_TO_RUB) <= 300);
  } 
  else if (currentCollection === "coop") {
    const kws = ["co-op", "coop", "multiplayer", "party", "takes two", "overcooked", "portal", "left 4 dead", "helldivers", "payday", "borderlands", "halo"];
    filtered = filtered.filter(d => kws.some(kw => d.title.toLowerCase().includes(kw)));
  } 
  else if (currentCollection === "rpg") {
    const kws = ["rpg", "witcher", "cyberpunk", "fallout", "elder scrolls", "skyrim", "persona", "yakuza", "baldur", "souls", "elden"];
    filtered = filtered.filter(d => kws.some(kw => d.title.toLowerCase().includes(kw)));
  } 
  else if (currentCollection === "horror") {
    const kws = ["horror", "resident evil", "silent hill", "outlast", "amnesia", "dead space", "fear", "zombie", "evil within"];
    filtered = filtered.filter(d => kws.some(kw => d.title.toLowerCase().includes(kw)));
  } 
  else if (currentCollection === "action") {
    const kws = ["action", "shooter", "doom", "battlefield", "gta", "red dead", "assassin", "spider-man", "god of war"];
    filtered = filtered.filter(d => kws.some(kw => d.title.toLowerCase().includes(kw)));
  }

  // Явная сортировка, включая DealRating
  if (currentSort === "DealRating") {
    filtered.sort((a, b) => Number(b.dealRating || 0) - Number(a.dealRating || 0));
  } else if (currentSort === "Savings") {
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
    container.innerHTML = '<div class="empty">Скидки временно обновляются на стороне Steam. Попробуйте обновить чуть позже.</div>';
    return;
  }

  container.innerHTML = deals.map(d => {
    const isFav = isFavorite(d.dealId);
    const buyUrl = d.steamUrl || `https://store.steampowered.com/app/${d.steamAppId || ''}`;
    const safeTitle = encodeURIComponent(d.title || "");
    const safeThumb = encodeURIComponent(d.thumb || "");

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
          <button class="favorite-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite({
            id: '${d.dealId}',
            gameId: '${d.gameId || ''}',
            steamAppId: '${d.steamAppId || ''}',
            steamUrl: '${buyUrl}',
            title: '${escapeHtml(d.title)}',
            thumb: '${d.thumb}',
            salePriceUsd: '${d.salePriceUsd}',
            normalPriceUsd: '${d.normalPriceUsd}',
            savingsPct: ${d.savingsPct}
          }, event)">
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
  if (showLoader && !cachedDeals.length) {
    container.innerHTML = '<div class="loading">Получаем скидки от 30%...</div>';
  }

  try {
    const res = await fetch(`${API_BASE}/api/deals`);
    const data = await res.json();
    if (data.deals && data.deals.length > 0) {
      cachedDeals = data.deals;
    }
  } catch (err) {
    console.warn("Ошибка скидок:", err);
  }

  applyFiltersAndRender();
}

async function loadNews() {
  const container = document.getElementById("news-list");
  if (!container) return;

  container.innerHTML = '<div class="loading">Читаем свежие игровые публикации...</div>';

  try {
    const res = await fetch(`${API_BASE}/api/news`);
    const data = await res.json();
    cachedNews = data.items || [];
    
    if (!cachedNews.length) {
      container.innerHTML = '<div class="empty">Не удалось загрузить новости.</div>';
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

      return `
        <div class="news-card" onclick="openNewsModal(${index})">
          <img class="news-thumb" src="${news.thumbnail}" alt="news" onerror="this.src='https://via.placeholder.com/600x338?text=Gaming+News'">
          <div class="news-info">
            <h3 class="news-title">${escapeHtml(news.title)}</h3>
            <div class="news-date">🕒 ${dateStr} • ${escapeHtml(news.sourceName || 'Новости')}</div>
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    container.innerHTML = '<div class="empty">Ошибка загрузки новостей</div>';
  }
}

// 7. НАСТОЯЩИЙ ПОИСК С ЛУЧШИМИ ЦЕНАМИ
async function handleSearch() {
  const input = document.getElementById("search-input");
  const query = input?.value?.trim();
  const container = document.getElementById("search-results-list");

  if (!query || !container) return;
  container.innerHTML = '<div class="loading">Ищем лучшую цену по магазинам...</div>';

  try {
    const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    const results = data.results || [];

    if (!results.length) {
      container.innerHTML = `<div class="empty">По запросу «${escapeHtml(query)}» ничего не найдено</div>`;
      return;
    }

    container.innerHTML = results.map(g => {
      const buyUrl = g.cheapestDealId 
        ? `https://www.cheapshark.com/redirect?dealID=${g.cheapestDealId}`
        : (g.steamAppId ? `https://store.steampowered.com/app/${g.steamAppId}` : "https://store.steampowered.com");
      
      const safeTitle = encodeURIComponent(g.title || "");
      const safeThumb = encodeURIComponent(g.thumb || "");
      
      return `
        <div class="deal-card" onclick="openGameModal('${g.cheapestDealId || ''}', '${g.gameId || ''}', '${g.steamAppId || ''}', '${g.cheapestPriceUsd}', '${safeTitle}', '${safeThumb}')">
          <img class="deal-thumb" src="${g.thumb}" alt="${escapeHtml(g.title)}" onerror="this.style.display='none'">
          <div class="deal-info">
            <div class="deal-title">${escapeHtml(g.title)}</div>
            <div class="deal-meta"><span>Минимальная цена на рынке</span></div>
          </div>
          <div class="deal-pricing">
            <span class="new-price">${formatPrice(g.cheapestPriceUsd)}</span>
            <button class="quick-buy-btn" onclick="openExternalLink('${buyUrl}', event)">Купить</button>
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    container.innerHTML = '<div class="empty">Ошибка поиска цен</div>';
  }
}

// 8. ИНИЦИАЛИЗАЦИЯ И ШЕРИНГ ВИШЛИСТА
function init() {
  updateWatchlistBadge();

  // Реализация кнопки "Поделиться вишлистом"
  const shareBtn = document.getElementById("share-watchlist-btn");
  if (shareBtn) {
    shareBtn.onclick = () => {
      const list = getWatchlist();
      if (!list.length) {
        alert("В вишлисте пока нет игр для отправки!");
        return;
      }

      const text = "🎮 Мой список желаемых игр:\n" + 
        list.slice(0, 5).map(g => `• ${g.title} (${formatPrice(g.salePriceUsd)})`).join("\n") +
        (list.length > 5 ? `\n...и ещё ${list.length - 5} игр` : "");

      if (window.Telegram?.WebApp?.openTelegramLink) {
        window.Telegram.WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent("https://t.me/your_bot_name")}&text=${encodeURIComponent(text)}`);
      } else if (navigator.share) {
        navigator.share({ title: "Мой список желаемого", text });
      } else {
        navigator.clipboard.writeText(text);
        alert("Список игр скопирован в буфер обмена!");
      }
    };
  }

  // Калькулятор пополнения
  const calcModal = document.getElementById("calc-modal");
  const openCalcBtn = document.getElementById("open-calc-btn");
  const closeCalcBtn = document.getElementById("close-calc-btn");
  const calcInput = document.getElementById("calc-input");
  const calcResult = document.getElementById("calc-result");
  const calcSymbol = document.getElementById("calc-currency-symbol");
  let calcRegion = "RU"; 

  function updateCalc() {
    const val = Number(calcInput.value) || 0;
    const finalAmount = Math.round(val * 1.15); // ~15% усреднённая комиссия
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
    openExternalLink("https://plati.market/cat/steam-cards/22812"); // Прямая ссылка на надежную витрину ваучеров и пополнений
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

  document.getElementById("close-news-modal-btn")?.addEventListener("click", () => {
    const modal = document.getElementById("news-modal");
    if (modal) modal.style.display = "none";
  });

  document.getElementById("game-modal")?.addEventListener("click", e => {
    if (e.target.id === "game-modal") {
      e.target.style.display = "none";
      const video = e.target.querySelector("video");
      if (video) video.pause();
    }
  });

  document.getElementById("news-modal")?.addEventListener("click", e => {
    if (e.target.id === "news-modal") e.target.style.display = "none";
  });

  document.getElementById("calc-modal")?.addEventListener("click", e => {
    if (e.target.id === "calc-modal") e.target.style.display = "none";
  });

  switchTab("giveaways");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
