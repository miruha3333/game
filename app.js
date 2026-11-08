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

// Текущее состояние
let activeTab = "giveaways";
let currentSort = "DealRating";
let countdownInterval = null;

// Примерный курс доллара к рублю для удобства игроков
const USD_TO_RUB = 95;

function formatPrice(usd) {
  const num = Number(usd);
  if (isNaN(num)) return usd;
  const rub = Math.round(num * USD_TO_RUB);
  return `${rub} ₽ ($${num.toFixed(2)})`;
}

// 1. ПЕРЕКЛЮЧЕНИЕ ТАБОВ
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
}

// 2. ЗАГРУЗКА БЕСПЛАТНЫХ РАЗДАЧ (EGS + STEAM)
async function loadGiveaways() {
  const activeContainer = document.getElementById("active-giveaways-list");
  const upcomingContainer = document.getElementById("upcoming-giveaways-list");

  try {
    const res = await fetch(`${API_BASE}/api/giveaways`);
    const data = await res.json();

    const activeList = data.active || [];
    const upcomingList = data.upcoming || [];

    // Активные раздачи
    if (!activeList.length) {
      activeContainer.innerHTML = '<div class="empty">Прямо сейчас нет активных раздач</div>';
    } else {
      activeContainer.innerHTML = activeList.map(game => `
        <div class="giveaway-card">
          <img class="giveaway-img" src="${game.image}" alt="${game.title}" onerror="this.src='https://via.placeholder.com/600x338?text=Free+Game'">
          <div class="giveaway-body">
            <h3 class="giveaway-title">${game.title}</h3>
            <div class="giveaway-desc">${game.description || "Бесплатная раздача игры"}</div>
            <div class="giveaway-footer">
              <div class="giveaway-timer" data-end-time="${game.endDate}">Загрузка таймера...</div>
              <a href="${game.storeUrl}" target="_blank" class="claim-btn">Забрать (0₽)</a>
            </div>
          </div>
        </div>
      `).join("");
    }

    // Будущие раздачи (следующий четверг)
    if (!upcomingList.length) {
      upcomingContainer.innerHTML = '<div class="empty">Анонсов следующих раздач пока нет</div>';
    } else {
      upcomingContainer.innerHTML = upcomingList.map(game => `
        <div class="giveaway-card" style="opacity: 0.85;">
          <img class="giveaway-img" src="${game.image}" alt="${game.title}" onerror="this.src='https://via.placeholder.com/600x338?text=Upcoming+Game'">
          <div class="giveaway-body">
            <h3 class="giveaway-title">${game.title}</h3>
            <div class="giveaway-desc">${game.description || "Скоро на раздаче"}</div>
            <div class="giveaway-footer">
              <span style="font-size: 11px; color: var(--text-dim);">Старт: ${new Date(game.startDate).toLocaleDateString("ru-RU")}</span>
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

// Таймер обратного отсчета для активных раздач
function startTimers() {
  if (countdownInterval) clearInterval(countdownInterval);

  function update() {
    document.querySelectorAll(".giveaway-timer[data-end-time]").forEach(el => {
      const end = new Date(el.dataset.endTime).getTime();
      const now = Date.now();
      const diff = end - now;

      if (diff <= 0) {
        el.textContent = "Раздача завершена";
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      el.textContent = `⏳ Осталось: ${days}д ${hours}ч ${minutes}м`;
    });
  }

  update();
  countdownInterval = setInterval(update, 60000); // Обновление каждую минуту
}

// 3. ЗАГРУЗКА СКИДОК 70%+ В STEAM
async function loadDeals() {
  const container = document.getElementById("deals-list");
  container.innerHTML = '<div class="loading">Загружаем скидки из Steam...</div>';

  try {
    const res = await fetch(`${API_BASE}/api/deals?minSavings=70&sortBy=${currentSort}`);
    const data = await res.json();
    const deals = data.deals || [];

    if (!deals.length) {
      container.innerHTML = '<div class="empty">Скидок не найдено</div>';
      return;
    }

    container.innerHTML = deals.map(d => `
      <a href="${d.steamUrl}" target="_blank" class="deal-card">
        <img class="deal-thumb" src="${d.thumb}" alt="${d.title}" onerror="this.style.display='none'">
        <div class="deal-info">
          <div class="deal-title">${d.title}</div>
          <div class="deal-meta">
            ${d.steamRatingPercent ? `<span>👍 ${d.steamRatingPercent}%</span>` : ''}
            ${d.metacriticScore ? `<span>🏆 MC: ${d.metacriticScore}</span>` : ''}
          </div>
        </div>
        <div class="deal-pricing">
          <span class="deal-discount-badge">-${d.savingsPct}%</span>
          <div class="deal-prices">
            <span class="old-price">${formatPrice(d.normalPriceUsd)}</span>
            <span class="new-price">${formatPrice(d.salePriceUsd)}</span>
          </div>
        </div>
      </a>
    `).join("");
  } catch (err) {
    container.innerHTML = '<div class="empty">Не удалось загрузить скидки</div>';
  }
}

// 4. ПОИСК ИГРЫ
async function handleSearch() {
  const input = document.getElementById("search-input");
  const query = input?.value?.trim();
  const container = document.getElementById("search-results-list");

  if (!query) return;
  container.innerHTML = '<div class="loading">Ищем лучшую цену...</div>';

  try {
    const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    const results = data.results || [];

    if (!results.length) {
      container.innerHTML = `<div class="empty">По запросу «${query}» ничего не найдено</div>`;
      return;
    }

    container.innerHTML = results.map(g => `
      <a href="https://store.steampowered.com/app/${g.steamAppId || ''}" target="_blank" class="deal-card">
        <img class="deal-thumb" src="${g.thumb}" alt="${g.title}" onerror="this.style.display='none'">
        <div class="deal-info">
          <div class="deal-title">${g.title}</div>
          <div class="deal-meta"><span>Минимальная цена</span></div>
        </div>
        <div class="deal-pricing">
          <span class="new-price">${formatPrice(g.cheapestPriceUsd)}</span>
        </div>
      </a>
    `).join("");
  } catch (err) {
    container.innerHTML = '<div class="empty">Ошибка поиска</div>';
  }
}

// 5. ИНИЦИАЛИЗАЦИЯ
function init() {
  // Нажатие на табы
  document.getElementById("tab-giveaways")?.addEventListener("click", () => switchTab("giveaways"));
  document.getElementById("tab-deals")?.addEventListener("click", () => switchTab("deals"));
  document.getElementById("tab-search")?.addEventListener("click", () => switchTab("search"));
  document.getElementById("tab-watchlist")?.addEventListener("click", () => switchTab("watchlist"));

  // Сортировка скидок
  document.querySelectorAll(".deals-filter-bar button").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".deals-filter-bar button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentSort = btn.dataset.sort;
      loadDeals();
    };
  });

  // Поиск
  document.getElementById("search-btn")?.addEventListener("click", handleSearch);
  document.getElementById("search-input")?.addEventListener("keydown", e => {
    if (e.key === "Enter") handleSearch();
  });

  // Запуск по умолчанию с раздач
  switchTab("giveaways");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
