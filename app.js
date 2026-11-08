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

// Надежное открытие внешних ссылок внутри Telegram
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
let countdownInterval = null;
let cachedDeals = [];

// Примерный курс доллара к рублю
const USD_TO_RUB = 95;

function formatPrice(usd) {
  const num = Number(usd);
  if (isNaN(num)) return usd;
  const rub = Math.round(num * USD_TO_RUB);
  return `${rub} ₽ ($${num.toFixed(2)})`;
}

// ==========================================
// 1. ИЗБРАННОЕ (WATCHLIST) И ЭКОНОМИЯ
// ==========================================
function getWatchlist() {
  try {
    return JSON.parse(localStorage.getItem("game_deals_watchlist") || "[]");
  } catch (_) {
    return [];
  }
}

function saveWatchlist(list) {
  try {
    localStorage.setItem("game_deals_watchlist", JSON.stringify(list));
  } catch (_) {}
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
  if (activeTab === "deals") renderDealsList(cachedDeals);
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
    const diff = Math.max(0, item.normalPriceUsd - item.salePriceUsd);
    totalSavingsUsd += diff;
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
// 2. МОДАЛЬНОЕ ОКНО ДОСЬЕ ИГРЫ
// ==========================================
async function openGameModal(dealId, gameId, steamAppId, currentPriceUsd, titleRaw, thumbRaw) {
  const modal = document.getElementById("game-modal");
  const content = document.getElementById("modal-content");
  if (!modal || !content) return;

  const title = titleRaw ? decodeURIComponent(titleRaw) : "Игра";
  const thumb = thumbRaw ? decodeURIComponent(thumbRaw) : "";

  modal.style.display = "flex";
  
  // Мгновенный пре-рендер с обложкой и названием, чтобы окно не было пустым
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
    // В случае ошибки оставляем хотя бы картинку и базовые кнопки
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
// 3. ТАБЫ И ЗАГРУЗКА СПИСКОВ
// ==========================================
function switchTab(tab) {
  activeTab = tab;
  ["giveaways", "deals", "search", "watchlist"].forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    const view = document.getElementById(`view-${t}`);
    if (btn) btn.classList.toggle("active", t === tab);
    if (view) view.style.display = (t === tab) ? "" : "none";
  });

  if (tab === "giveaways") loadGiveaways();
  if (tab === "deals") loadDeals();
  if (tab === "watchlist") renderWatchlist();
}

async function loadGiveaways() {
  const activeContainer = document.getElementById("active-giveaways-list");
  const upcomingContainer = document.getElementById("upcoming-giveaways-list");
  if (!activeContainer || !upcomingContainer) return;

  try {
    const res = await fetch(`${API_BASE}/api/giveaways`);
    const data = await res.json();
    const activeList = data.active || [];
    const upcomingList = data.upcoming || [];

    if (!activeList.length) {
      activeContainer.innerHTML = '<div class="empty">Прямо сейчас нет активных раздач</div>';
    } else {
      activeContainer.innerHTML = activeList.map(game => `
        <div class="giveaway-card">
          <img class="giveaway-img" src="${game.image}" alt="${escapeHtml(game.title)}" onerror="this.src='https://via.placeholder.com/600x338?text=Free+Game'">
          <div class="giveaway-body">
            <h3 class="giveaway-title">${escapeHtml(game.title)}</h3>
            <div class="giveaway-desc">${escapeHtml(game.description || "Бесплатная раздача игры")}</div>
            <div class="giveaway-footer">
              <div class="giveaway-timer" data-end-time="${game.endDate}">Загрузка таймера...</div>
              <button class="claim-btn" onclick="openExternalLink('${game.storeUrl}', event)">Забрать (0₽)</button>
            </div>
          </div>
        </div>
      `).join("");
    }

    if (!upcomingList.length) {
      upcomingContainer.innerHTML = '<div class="empty">Анонсов следующих раздач пока нет</div>';
    } else {
      upcomingContainer.innerHTML = upcomingList.map(game => `
        <div class="giveaway-card" style="opacity:0.85;">
          <img class="giveaway-img" src="${game.image}" alt="${escapeHtml(game.title)}" onerror="this.src='https://via.placeholder.com/600x338?text=Upcoming+Game'">
          <div class="giveaway-body">
            <h3 class="giveaway-title">${escapeHtml(game.title)}</h3>
            <div class="giveaway-desc">${escapeHtml(game.description || "Скоро на раздаче")}</div>
            <div class="giveaway-footer">
              <span style="font-size:11px;color:var(--text-dim);">Старт: ${new Date(game.startDate).toLocaleDateString("ru-RU")}</span>
              <span class="badge-free">СКОРО</span>
            </div>
          </div>
        </div>
      `).join("");
    }

    startTimers();
  } catch (err) {
    activeContainer.innerHTML = '<div class="empty">Не удалось загрузить халяву</div>';
  }
}

// Живой таймер с секундами
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

// Отрисовка списка скидок
function renderDealsList(deals) {
  const container = document.getElementById("deals-list");
  if (!container) return;

  if (!deals.length) {
    container.innerHTML = '<div class="empty">Скидок не найдено</div>';
    return;
  }

  container.innerHTML = deals.map(d => {
    const isFav = isFavorite(d.dealId);
    const buyUrl = d.steamUrl || `https://store.steampowered.com/app/${d.steamAppId || ''}`;
    
    // Экранируем данные, чтобы не сломать HTML кавычками в названиях
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

// Загрузка и сортировка скидок
async function loadDeals(showLoader = true) {
  const container = document.getElementById("deals-list");
  if (!container) return;
  if (showLoader) container.innerHTML = '<div class="loading">Загружаем скидки из Steam...</div>';

  try {
    const res = await fetch(`${API_BASE}/api/deals`);
    const data = await res.json();
    cachedDeals = data.deals || [];

    let sorted = [...cachedDeals];
    if (currentSort === "Savings") {
      sorted.sort((a, b) => b.savingsPct - a.savingsPct);
    } else if (currentSort === "Price") {
      sorted.sort((a, b) => Number(a.salePriceUsd) - Number(b.salePriceUsd));
    } else if (currentSort === "Metacritic") {
      sorted.sort((a, b) => Number(b.metacriticScore || 0) - Number(a.metacriticScore || 0));
    }

    renderDealsList(sorted);
  } catch (err) {
    container.innerHTML = '<div class="empty">Не удалось загрузить скидки</div>';
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
// 4. ЗАПУСК И СЛУШАТЕЛИ СОБЫТИЙ
// ==========================================
function init() {
  updateWatchlistBadge();

  document.getElementById("steam-topup-btn")?.addEventListener("click", (e) => {
    openExternalLink("https://store.steampowered.com", e);
  });

  document.getElementById("tab-giveaways")?.addEventListener("click", () => switchTab("giveaways"));
  document.getElementById("tab-deals")?.addEventListener("click", () => switchTab("deals"));
  document.getElementById("tab-search")?.addEventListener("click", () => switchTab("search"));
  document.getElementById("tab-watchlist")?.addEventListener("click", () => switchTab("watchlist"));

  document.querySelectorAll(".deals-filter-bar button").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".deals-filter-bar button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentSort = btn.dataset.sort;

      let sorted = [...cachedDeals];
      if (currentSort === "Savings") {
        sorted.sort((a, b) => b.savingsPct - a.savingsPct);
      } else if (currentSort === "Price") {
        sorted.sort((a, b) => Number(a.salePriceUsd) - Number(b.salePriceUsd));
      } else if (currentSort === "Metacritic") {
        sorted.sort((a, b) => Number(b.metacriticScore || 0) - Number(a.metacriticScore || 0));
      }
      renderDealsList(sorted);
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
