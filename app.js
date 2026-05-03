/* =============================================================
   糖尿病醣類計算器 — Phase 2 PWA shell
   - 4 tab 切換 / 暗色模式 / 設定載入儲存 / 醫療免責 modal
   - 食材庫載入驗證 / Cloudinary 預設值
   - Service Worker 註冊
   ============================================================= */

const APP_VERSION = '0.2.0';
const APP_BUILD_DATE = '2026-05-02';

/* ---------- 預設常數（client-side runtime；不寫進 commit/README）---------- */
const DEFAULT_CLOUDINARY_CLOUD_NAME = 'dcelpklzi';
const DEFAULT_CLOUDINARY_UPLOAD_PRESET = 'carb-meals';

/* ---------- localStorage keys ---------- */
const LS = {
  THEME: 'cc_theme',                     // 'auto' | 'light' | 'dark'
  DISCLAIMER: 'cc_disclaimer_acked',     // '1' = 已接受
  NICKNAME: 'cc_nickname',
  IC_BREAKFAST: 'cc_ic_breakfast',
  IC_LUNCH: 'cc_ic_lunch',
  IC_DINNER: 'cc_ic_dinner',
  BG_LOW: 'cc_bg_low',
  BG_HIGH: 'cc_bg_high',
  PHASH_TH: 'cc_phash_th',
  CD_CLOUD: 'cc_cd_cloud',
  CD_PRESET: 'cc_cd_preset',
  LAST_TAB: 'cc_last_tab',
};

/* ---------- 工具 ---------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const lsGet = (k, fallback = null) => {
  const v = localStorage.getItem(k);
  return v === null ? fallback : v;
};
const lsSet = (k, v) => localStorage.setItem(k, String(v));

function showToast(msg, kind = '', duration = 2400) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast ' + kind;
  t.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.add('hidden'), duration);
}

/* ---------- 醫療免責 ---------- */
function setupDisclaimer() {
  const modal = $('#disclaimer-modal');
  const check = $('#disclaimer-check');
  const okBtn = $('#disclaimer-ok');

  if (lsGet(LS.DISCLAIMER) === '1') {
    modal.classList.add('hidden');
    return;
  }
  modal.classList.remove('hidden');
  check.addEventListener('change', () => { okBtn.disabled = !check.checked; });
  okBtn.addEventListener('click', () => {
    lsSet(LS.DISCLAIMER, '1');
    modal.classList.add('hidden');
    showToast('開始使用 — 祝控糖順利', 'success');
  });
}

/* ---------- Tab 切換 ---------- */
function setupTabs() {
  const tabs = $$('.tab-btn');
  const panels = $$('.tab-panel');
  const switchTo = (tabId) => {
    tabs.forEach(b => {
      const active = b.dataset.tab === tabId;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    panels.forEach(p => {
      const active = p.id === tabId;
      p.classList.toggle('active', active);
      if (active) p.removeAttribute('hidden');
      else p.setAttribute('hidden', '');
    });
    lsSet(LS.LAST_TAB, tabId);
  };
  tabs.forEach(b => b.addEventListener('click', () => switchTo(b.dataset.tab)));
  // 還原上次 tab
  const last = lsGet(LS.LAST_TAB);
  if (last && document.getElementById(last)) switchTo(last);
}

/* ---------- 暗色模式 ---------- */
function setupTheme() {
  const root = document.documentElement;
  const apply = (mode) => {
    if (mode === 'auto') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', mode);
    }
    // 同步 settings radio
    const r = document.querySelector(`input[name="theme"][value="${mode}"]`);
    if (r) r.checked = true;
  };
  const stored = lsGet(LS.THEME, 'auto');
  apply(stored);

  // header toggle 循環：auto → light → dark → auto
  $('#theme-toggle').addEventListener('click', () => {
    const cur = lsGet(LS.THEME, 'auto');
    const next = cur === 'auto' ? 'light' : cur === 'light' ? 'dark' : 'auto';
    lsSet(LS.THEME, next);
    apply(next);
    showToast(`暗色模式：${next === 'auto' ? '跟隨系統' : next === 'light' ? '亮' : '暗'}`);
  });

  // settings 內 radio
  document.querySelectorAll('input[name="theme"]').forEach(r => {
    r.addEventListener('change', () => {
      lsSet(LS.THEME, r.value);
      apply(r.value);
    });
  });
}

/* ---------- Refresh 按鈕（清 cache + reload）---------- */
function setupRefresh() {
  $('#refresh-btn').addEventListener('click', async () => {
    showToast('清快取重新載入中…');
    try {
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch (e) {
      console.warn('cache clear failed', e);
    }
    setTimeout(() => location.reload(), 300);
  });
}

/* ---------- Settings: 個人 + I:C + BG ---------- */
function setupPersonalSettings() {
  const fields = [
    ['#set-nickname', LS.NICKNAME, ''],
    ['#set-ic-breakfast', LS.IC_BREAKFAST, '1:8.0'],
    ['#set-ic-lunch', LS.IC_LUNCH, '1:10.0'],
    ['#set-ic-dinner', LS.IC_DINNER, '1:10.0'],
    ['#set-bg-low', LS.BG_LOW, '70'],
    ['#set-bg-high', LS.BG_HIGH, '180'],
  ];
  fields.forEach(([sel, key, def]) => {
    const el = $(sel);
    if (!el) return;
    el.value = lsGet(key, def);
    el.addEventListener('change', () => lsSet(key, el.value));
  });
}

/* ---------- Settings: pHash 門檻 ---------- */
function setupPHashSlider() {
  const slider = $('#set-phash-th');
  const valSpan = $('#phash-th-val');
  if (!slider) return;
  slider.value = lsGet(LS.PHASH_TH, '8');
  valSpan.textContent = slider.value;
  slider.addEventListener('input', () => {
    valSpan.textContent = slider.value;
    lsSet(LS.PHASH_TH, slider.value);
  });
}

/* ---------- Settings: Cloudinary ---------- */
function setupCloudinary() {
  const cloudInput = $('#set-cd-cloud');
  const presetInput = $('#set-cd-preset');
  const testBtn = $('#cd-test-btn');
  const resetBtn = $('#cd-reset-btn');
  const status = $('#cd-status');

  // 第一次開 app：寫入預設值
  if (lsGet(LS.CD_CLOUD) === null) lsSet(LS.CD_CLOUD, DEFAULT_CLOUDINARY_CLOUD_NAME);
  if (lsGet(LS.CD_PRESET) === null) lsSet(LS.CD_PRESET, DEFAULT_CLOUDINARY_UPLOAD_PRESET);

  cloudInput.value = lsGet(LS.CD_CLOUD, '');
  presetInput.value = lsGet(LS.CD_PRESET, '');
  cloudInput.addEventListener('change', () => lsSet(LS.CD_CLOUD, cloudInput.value.trim()));
  presetInput.addEventListener('change', () => lsSet(LS.CD_PRESET, presetInput.value.trim()));

  resetBtn.addEventListener('click', () => {
    cloudInput.value = DEFAULT_CLOUDINARY_CLOUD_NAME;
    presetInput.value = DEFAULT_CLOUDINARY_UPLOAD_PRESET;
    lsSet(LS.CD_CLOUD, DEFAULT_CLOUDINARY_CLOUD_NAME);
    lsSet(LS.CD_PRESET, DEFAULT_CLOUDINARY_UPLOAD_PRESET);
    status.textContent = '已恢復預設';
    status.className = 'status-line muted';
    showToast('已恢復 Cloudinary 預設值');
  });

  testBtn.addEventListener('click', async () => {
    const cloud = cloudInput.value.trim();
    const preset = presetInput.value.trim();
    if (!cloud || !preset) {
      status.textContent = '✕ 請先填 Cloud Name 與 Preset';
      status.className = 'status-line';
      status.style.color = 'var(--c-red)';
      return;
    }
    status.textContent = '⏳ 測試上傳中…';
    status.className = 'status-line muted';
    status.style.color = '';

    // 1×1 透明 PNG
    const png = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');
    const bytes = new Uint8Array(png.length);
    for (let i = 0; i < png.length; i++) bytes[i] = png.charCodeAt(i);

    const fd = new FormData();
    fd.append('upload_preset', preset);
    fd.append('file', new Blob([bytes], { type: 'image/png' }), 'cc_test.png');

    try {
      const r = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
        method: 'POST', body: fd
      });
      const j = await r.json();
      if (r.ok && j.secure_url) {
        status.textContent = `✓ 上傳成功（${j.bytes} bytes，${j.format}）`;
        status.style.color = 'var(--c-success)';
        showToast('Cloudinary 連線正常', 'success');
      } else {
        const err = j.error?.message || `HTTP ${r.status}`;
        status.textContent = `✕ ${err}`;
        status.style.color = 'var(--c-red)';
      }
    } catch (e) {
      status.textContent = `✕ 網路錯誤：${e.message}`;
      status.style.color = 'var(--c-red)';
    }
  });
}

/* ---------- 食材庫載入（驗證 food-db.json 可讀）---------- */
async function loadFoodDb() {
  // 先嘗試 fetch（HTTP / 部署環境）
  try {
    const r = await fetch('food-db.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const db = await r.json();
    onFoodDbLoaded(db);
    return;
  } catch (e) {
    console.warn('fetch food-db.json failed, trying script fallback', e);
  }
  // Fallback：用 <script> 載 food-db.js（file:// 也能跑）
  try {
    await loadScript('food-db.js');
    if (window.__FOOD_DB__) {
      onFoodDbLoaded(window.__FOOD_DB__);
      return;
    }
    throw new Error('food-db.js loaded but window.__FOOD_DB__ undefined');
  } catch (e) {
    console.error('food-db load fully failed', e);
    showFoodDbError();
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('script load failed: ' + src));
    document.head.appendChild(s);
  });
}

function onFoodDbLoaded(db) {
  const foods = db.foods || [];
  const total = foods.length;
  const confirmed = foods.filter(x => x.gi_confirmed).length;
  const estimated = total - confirmed;
  $('#food-count').textContent = `${total} 筆`;
  $('#food-confirmed').textContent = `${confirmed} 筆`;
  $('#food-estimated').textContent = `${estimated} 筆（待確認）`;
  window._foodDb = db;
  Exclusion.init(db);  // 必須先於 Calc.init，因 Calc.filterFoods 會讀 Exclusion.set
  Calc.init(db);
  Records.init();
  Trends.init();
  Sync.init();
  Reminder.init();
}

function showFoodDbError() {
  $('#food-count').textContent = '✕ 載入失敗';
  $('#food-confirmed').textContent = '—';
  $('#food-estimated').textContent = '—';

  // 計算器區替換成清楚的錯誤指引
  const chipArea = $('#chip-area');
  const catTabs = $('#cat-tabs');
  const selList = $('#selected-list');
  if (catTabs) catTabs.innerHTML = '';
  if (chipArea) chipArea.innerHTML = '';

  const banner = document.createElement('div');
  banner.className = 'food-db-error';
  const isFile = location.protocol === 'file:';
  banner.innerHTML = `
    <h3>⚠ 食材庫載不進來</h3>
    <p>${isFile ? '你直接 double-click 開了 HTML 檔（file://）。' : '無法讀取 food-db.json。'}瀏覽器在 file:// 下會擋 JSON 讀取。</p>
    <p><strong>解法：用 HTTP server 開啟。</strong></p>
    <p>在終端機跑：</p>
    <pre>cd "${isFile ? location.pathname.replace(/\/[^/]+$/, '').replace(/^\//, '') : ''}"
python3 -m http.server 8000</pre>
    <p>然後瀏覽器開 <code>http://localhost:8000</code>。</p>
    <p class="muted small">部署到 GitHub Pages 之後（Phase 7）就不需要本機 server。</p>
  `;
  if (selList) {
    selList.innerHTML = '';
    selList.appendChild(banner);
  }
}

/* =============================================================
   Calc — 計算器模組（Phase 3）
   ============================================================= */
const Calc = {
  db: null,
  // 顯示用分類（按使用頻率排序，與 food-db category 對映）
  categories: ['主食', '蔬菜', '蛋白質', '水果', '飲料', '點心', '便當/加工', '加工', '油脂', '調味', '其他'],
  state: {
    cat: '主食',
    filter: 'common',     // 'common' | 'all'
    query: '',
    selected: [],         // [{food, grams}]
  },
  giOverrides: {},        // localStorage: cc_gi_overrides

  init(db) {
    this.db = db;
    // 載入 GI overrides
    try {
      this.giOverrides = JSON.parse(localStorage.getItem('cc_gi_overrides') || '{}');
    } catch { this.giOverrides = {}; }

    this.renderCatTabs();
    this.bindEvents();
    this.renderChips();
    this.render();
  },

  renderCatTabs() {
    const wrap = $('#cat-tabs');
    wrap.innerHTML = '';
    this.categories.forEach(cat => {
      const b = document.createElement('button');
      b.className = 'cat-tab' + (cat === this.state.cat ? ' active' : '');
      b.textContent = cat;
      b.dataset.cat = cat;
      b.addEventListener('click', () => {
        this.state.cat = cat;
        wrap.querySelectorAll('.cat-tab').forEach(x => x.classList.toggle('active', x.dataset.cat === cat));
        this.renderChips();
      });
      wrap.appendChild(b);
    });
  },

  bindEvents() {
    // 搜尋
    const searchInput = $('#calc-search');
    searchInput.addEventListener('input', e => {
      this.state.query = e.target.value.trim().toLowerCase();
      this.renderChips();
    });

    // common / all toggle
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.addEventListener('click', () => {
        this.state.filter = b.dataset.filter;
        document.querySelectorAll('.filter-btn').forEach(x =>
          x.classList.toggle('active', x.dataset.filter === this.state.filter));
        this.renderChips();
      });
    });

    // 操作
    $('#btn-clear-calc').addEventListener('click', () => this.clearAll());
    $('#btn-add-record').addEventListener('click', () => this.addToRecord());

    // food modal close
    $('#food-modal-close').addEventListener('click', () => this.closeFoodModal());
    $('#food-modal').addEventListener('click', e => {
      if (e.target.id === 'food-modal') this.closeFoodModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.closeFoodModal();
    });
  },

  /* --- 食材 chip 區渲染 --- */
  filterFoods() {
    const { cat, filter, query } = this.state;
    const q = query;
    const excluded = Exclusion.set;
    return this.db.foods.filter(f => {
      // 搜尋模式跨分類；無搜尋時依 cat
      if (!q && f.category !== cat) return false;
      if (filter === 'common' && !f.is_common) return false;
      if (excluded.has(f.id)) return false;  // 「我不吃」過濾
      if (q) {
        const name = (f.name_zh || '').toLowerCase();
        const en = (f.name_en || '').toLowerCase();
        const aliases = (f.name_alias || []).map(a => a.toLowerCase());
        if (!name.includes(q) && !en.includes(q) && !aliases.some(a => a.includes(q))) return false;
      }
      return true;
    });
  },

  renderChips() {
    const area = $('#chip-area');
    const empty = $('#chip-empty');
    const list = this.filterFoods();
    area.innerHTML = '';
    if (!list.length) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    // 上限避免渲染太多（搜尋全部時）
    const display = list.slice(0, 200);
    const frag = document.createDocumentFragment();
    display.forEach(f => {
      const c = document.createElement('button');
      c.className = 'chip';
      c.dataset.cat = f.category;
      c.dataset.id = f.id;
      c.textContent = f.name_zh;
      c.addEventListener('click', () => this.addFood(f));
      frag.appendChild(c);
    });
    if (list.length > display.length) {
      const more = document.createElement('span');
      more.className = 'chip muted';
      more.style.cursor = 'default';
      more.textContent = `+ ${list.length - display.length} 筆…`;
      more.title = '輸入更精確的關鍵字過濾';
      frag.appendChild(more);
    }
    area.appendChild(frag);
  },

  /* --- 已選食材 --- */
  addFood(food) {
    // 同食材已加 → 增加 50g 上限避免重複
    const exist = this.state.selected.find(s => s.food.id === food.id);
    if (exist) {
      exist.grams = Math.min(exist.grams + 50, 9999);
    } else {
      // 預設克數依分類
      const defaultGrams = this._defaultGrams(food);
      this.state.selected.push({ food, grams: defaultGrams });
    }
    this.render();
    showToast(`已加 ${food.name_zh}`, 'success', 1200);
  },

  _defaultGrams(food) {
    const c = food.category;
    if (c === '主食') return 150;
    if (c === '蔬菜') return 80;
    if (c === '水果') return 120;
    if (c === '蛋白質') return 100;
    if (c === '飲料') return 250;
    if (c === '點心') return 50;
    return 100;
  },

  setGrams(idx, g) {
    g = Math.max(0, Math.min(9999, parseInt(g) || 0));
    this.state.selected[idx].grams = g;
    this.render();
  },

  removeFood(idx) {
    this.state.selected.splice(idx, 1);
    this.render();
  },

  clearAll() {
    if (!this.state.selected.length) return;
    if (!confirm('清除目前所有已選食材？')) return;
    this.state.selected = [];
    this.render();
  },

  /* --- 計算 --- */
  totals() {
    let kcal = 0, carb = 0, fiber = 0, protein = 0, fat = 0, sodium = 0;
    let weightedGiNum = 0; // sum(gi * carb_grams)
    const carbBreakdown = []; // [{name, carbG, color}]
    this.state.selected.forEach((s, i) => {
      const f = s.food, g = s.grams || 0, scale = g / 100;
      const c = (f.carb_100g || 0) * scale;
      kcal    += (f.kcal_100g || 0) * scale;
      carb    += c;
      fiber   += (f.fiber_100g || 0) * scale;
      protein += (f.protein_100g || 0) * scale;
      fat     += (f.fat_100g || 0) * scale;
      sodium  += (f.sodium_100g_mg || 0) * scale;
      const gi = this._effectiveGi(f);
      if (gi != null && c > 0) weightedGiNum += gi * c;
      if (c > 0.5) carbBreakdown.push({ name: f.name_zh, carbG: c, idx: i });
    });
    const netCarb = Math.max(0, carb - fiber);
    const weightedGi = carb > 0 ? (weightedGiNum / carb) : null;
    const gl = (weightedGi != null) ? (weightedGi * netCarb / 100) : null;
    return { kcal, carb, fiber, netCarb, protein, fat, sodium, weightedGi, gl, carbBreakdown };
  },

  _effectiveGi(food) {
    // 個人 override 優先
    if (this.giOverrides[food.id] != null) return this.giOverrides[food.id];
    return food.gi;
  },

  /* --- 渲染主畫面 --- */
  render() {
    this._renderSelected();
    this._renderTotals();
    this._renderDose();
  },

  _renderSelected() {
    const wrap = $('#selected-list');
    wrap.innerHTML = '';
    if (!this.state.selected.length) {
      wrap.innerHTML = '<p class="empty-hint muted">尚未選擇食材。從上方挑選或搜尋 →</p>';
      return;
    }
    this.state.selected.forEach((s, i) => {
      const f = s.food;
      const g = s.grams;
      const carbG = (f.carb_100g || 0) * g / 100;
      const row = document.createElement('div');
      row.className = 'sel-row';
      row.innerHTML = `
        <div class="sel-info">
          <span class="sel-name" data-idx="${i}">${escapeHtml(f.name_zh)}</span>
          <div class="sel-meta">碳水 ${carbG.toFixed(1)}g · GI ${this._effectiveGi(f) ?? '—'}${f.gi_confirmed ? '' : '<span style="color:var(--c-orange)"> ⚠估</span>'}</div>
        </div>
        <div class="gram-input-wrap">
          <button class="gram-btn" data-act="dec" data-idx="${i}">−</button>
          <input type="number" class="gram-input" min="0" max="9999" step="1" value="${g}" data-idx="${i}" inputmode="numeric">
          <button class="gram-btn" data-act="inc" data-idx="${i}">+</button>
          <span class="gram-unit">g</span>
        </div>
        <button class="sel-remove" data-idx="${i}" aria-label="移除">✕</button>
      `;
      wrap.appendChild(row);
    });
    // 綁事件
    wrap.querySelectorAll('.sel-name').forEach(el => {
      el.addEventListener('click', () => this.openFoodModal(this.state.selected[+el.dataset.idx].food));
    });
    wrap.querySelectorAll('.gram-input').forEach(el => {
      el.addEventListener('input', () => this.setGrams(+el.dataset.idx, el.value));
    });
    wrap.querySelectorAll('.gram-btn').forEach(b => {
      b.addEventListener('click', () => {
        const idx = +b.dataset.idx;
        const cur = this.state.selected[idx].grams;
        const delta = b.dataset.act === 'inc' ? 10 : -10;
        this.setGrams(idx, cur + delta);
      });
    });
    wrap.querySelectorAll('.sel-remove').forEach(b => {
      b.addEventListener('click', () => this.removeFood(+b.dataset.idx));
    });
  },

  _renderTotals() {
    const card = $('#totals-card');
    const actions = $('#calc-actions');
    if (!this.state.selected.length) {
      card.classList.add('hidden');
      actions.classList.add('hidden');
      return;
    }
    card.classList.remove('hidden');
    actions.classList.remove('hidden');
    const t = this.totals();
    $('#t-carb').textContent = `${t.carb.toFixed(1)} g`;
    $('#t-net-carb').textContent = `${t.netCarb.toFixed(1)} g`;
    $('#t-gi').textContent = t.weightedGi != null ? t.weightedGi.toFixed(0) : '—';
    const glEl = $('#t-gl');
    if (t.gl != null) {
      glEl.textContent = t.gl.toFixed(0);
      glEl.classList.toggle('high', t.gl >= 20);
      glEl.classList.toggle('warn', t.gl >= 10 && t.gl < 20);
    } else {
      glEl.textContent = '—';
      glEl.classList.remove('high', 'warn');
    }
    $('#t-kcal').textContent = `${t.kcal.toFixed(0)} kcal`;
    $('#t-protein').textContent = `${t.protein.toFixed(1)} g`;
    $('#t-fat').textContent = `${t.fat.toFixed(1)} g`;

    this._renderPie(t);
  },

  _renderPie(t) {
    const pie = $('#pie');
    const legend = $('#pie-legend');
    pie.innerHTML = '<circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--bd-card)" stroke-width="6"/>';
    legend.innerHTML = '';
    if (!t.carbBreakdown.length || t.carb < 0.5) return;

    const palette = ['#FFC107', '#FB8C00', '#E53935', '#FFB300', '#A0522D', '#43A047', '#FF7043', '#FFA726'];
    const sorted = [...t.carbBreakdown].sort((a, b) => b.carbG - a.carbG);
    let acc = 0;
    sorted.forEach((seg, i) => {
      const pct = (seg.carbG / t.carb) * 100;
      const color = palette[i % palette.length];
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', 21); c.setAttribute('cy', 21); c.setAttribute('r', 15.915);
      c.setAttribute('class', 'pie-segment');
      c.setAttribute('stroke', color);
      c.setAttribute('stroke-dasharray', `${pct.toFixed(2)} ${(100 - pct).toFixed(2)}`);
      c.setAttribute('stroke-dashoffset', (-acc).toFixed(2));
      pie.appendChild(c);
      acc += pct;

      const li = document.createElement('li');
      li.innerHTML = `<span class="swatch" style="background:${color}"></span>${escapeHtml(seg.name)} <span class="muted">${seg.carbG.toFixed(1)}g (${pct.toFixed(0)}%)</span>`;
      legend.appendChild(li);
    });
  },

  /* --- 建議劑量 --- */
  _renderDose() {
    const card = $('#dose-card');
    if (!this.state.selected.length) {
      card.classList.add('hidden');
      return;
    }
    card.classList.remove('hidden');

    const t = this.totals();
    const meal = this._currentMeal();
    const ic = this._icRatioFor(meal);
    const dose = ic > 0 ? (t.carb / ic) : 0;

    $('#dose-meal-label').textContent = ({
      breakfast: '🌅 早餐', lunch: '🌞 午餐', dinner: '🌙 晚餐', late: '🌃 宵夜'
    })[meal];
    $('#dose-ic-label').textContent = `I:C 1:${ic.toFixed(1)}`;
    $('#dose-big').textContent = dose.toFixed(1);
  },

  _currentMeal() {
    const h = new Date().getHours();
    if (h >= 5 && h < 10) return 'breakfast';
    if (h >= 10 && h < 15) return 'lunch';
    if (h >= 15 && h < 21) return 'dinner';
    return 'late';
  },

  _icRatioFor(meal) {
    // 從 settings 讀，例如 "1:8.0" → 8.0
    const key = meal === 'breakfast' ? LS.IC_BREAKFAST :
                meal === 'lunch'     ? LS.IC_LUNCH :
                                       LS.IC_DINNER;
    const raw = lsGet(key, '1:10.0');
    const m = String(raw).match(/(\d+(?:\.\d+)?)\s*$/);
    return m ? parseFloat(m[1]) : 10;
  },

  /* --- 加入紀錄 --- */
  addToRecord() {
    if (!this.state.selected.length) return;
    const prefillFoods = this.state.selected.map(s => ({ food: s.food, grams: s.grams }));
    // 切到紀錄 tab 並開新增 form
    $('#nav-records').click();
    setTimeout(() => Records.openForm({ mode: 'new', prefillFoods }), 80);
  },

  /* --- 食材詳情 modal --- */
  openFoodModal(food) {
    const f = food;
    const eff = this._effectiveGi(f);
    $('#fm-name').textContent = f.name_zh;
    const cat = $('#fm-cat-chip');
    cat.textContent = f.category;
    cat.dataset.cat = f.category;
    $('#fm-state').textContent = f.state === 'cooked' ? '熟食' : (f.state === 'raw' ? '生／乾' : '');
    const fmt = (v, unit = 'g') => v == null ? '—' : `${(+v).toFixed(1)} ${unit}`;
    $('#fm-kcal').textContent    = f.kcal_100g != null ? `${(+f.kcal_100g).toFixed(0)} kcal` : '—';
    $('#fm-carb').textContent    = fmt(f.carb_100g);
    $('#fm-fiber').textContent   = fmt(f.fiber_100g);
    $('#fm-net').textContent     = fmt(Math.max(0, (f.carb_100g || 0) - (f.fiber_100g || 0)));
    $('#fm-protein').textContent = fmt(f.protein_100g);
    $('#fm-fat').textContent     = fmt(f.fat_100g);
    $('#fm-sodium').textContent  = f.sodium_100g_mg != null ? `${(+f.sodium_100g_mg).toFixed(0)} mg` : '—';
    $('#fm-water').textContent   = fmt(f.water_100g);
    $('#fm-gi').textContent      = eff != null ? eff : '—';
    const conf = $('#fm-gi-conf');
    if (f.gi_confirmed) {
      conf.textContent = '✓ 已確認';
      conf.className = 'fm-gi-confidence confirmed';
    } else {
      conf.textContent = '⚠ 估計值，待確認';
      conf.className = 'fm-gi-confidence estimated';
    }
    $('#fm-gi-source').textContent = f.gi_source || '—';

    // override 區（只對 estimated 顯示）
    const ovRow = $('#fm-override-row');
    if (!f.gi_confirmed) {
      ovRow.classList.remove('hidden');
      $('#fm-override-input').value = this.giOverrides[f.id] ?? '';
      $('#fm-override-save').onclick = () => {
        const v = parseInt($('#fm-override-input').value);
        if (Number.isFinite(v) && v >= 0 && v <= 120) {
          this.giOverrides[f.id] = v;
          localStorage.setItem('cc_gi_overrides', JSON.stringify(this.giOverrides));
          showToast(`已存個人 GI: ${v}`, 'success');
          this.render();
        } else {
          delete this.giOverrides[f.id];
          localStorage.setItem('cc_gi_overrides', JSON.stringify(this.giOverrides));
          showToast('已移除個人 GI（用系統值）');
          this.render();
        }
        this.closeFoodModal();
      };
      $('#fm-override-clear').onclick = () => {
        delete this.giOverrides[f.id];
        localStorage.setItem('cc_gi_overrides', JSON.stringify(this.giOverrides));
        $('#fm-override-input').value = '';
        showToast('已重置');
        this.render();
      };
    } else {
      ovRow.classList.add('hidden');
    }

    $('#food-modal').classList.remove('hidden');
  },

  closeFoodModal() {
    $('#food-modal').classList.add('hidden');
  },
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* =============================================================
   Exclusion — 「我不吃的食材」管理（Phase 3.5）
   ============================================================= */
const Exclusion = {
  set: new Set(),       // food id 集合
  state: {
    cat: '主食',
    query: '',
  },

  init(db) {
    this.db = db;
    // 載入 localStorage
    try {
      const raw = JSON.parse(localStorage.getItem('cc_excluded_foods') || '[]');
      this.set = new Set(Array.isArray(raw) ? raw : []);
    } catch { this.set = new Set(); }

    // 設定頁按鈕
    const openBtn = $('#open-exclusion-btn');
    if (openBtn) {
      openBtn.addEventListener('click', () => this.open());
    }
    // modal 關閉
    const closeBtn = $('#exclusion-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    const modal = $('#exclusion-modal');
    if (modal) modal.addEventListener('click', e => {
      if (e.target.id === 'exclusion-modal') this.close();
    });

    // 搜尋
    const search = $('#exclusion-search');
    if (search) search.addEventListener('input', e => {
      this.state.query = e.target.value.trim().toLowerCase();
      this._renderList();
    });

    // 全部清除
    const clearBtn = $('#exclusion-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      if (!this.set.size) return;
      if (!confirm(`確認清除 ${this.set.size} 筆「我不吃」標記？`)) return;
      this.set.clear();
      this._save();
      this._renderList();
      this._updateCount();
      Calc.renderChips();
      showToast('已清除全部「不吃」標記', 'success');
    });

    this._updateCount();
  },

  open() {
    this._renderCatTabs();
    this._renderList();
    $('#exclusion-modal').classList.remove('hidden');
  },

  close() {
    $('#exclusion-modal').classList.add('hidden');
  },

  _renderCatTabs() {
    const wrap = $('#exclusion-cat-tabs');
    wrap.innerHTML = '';
    Calc.categories.forEach(cat => {
      // 只顯示有 is_common 的分類
      const has = this.db.foods.some(f => f.is_common && f.category === cat);
      if (!has) return;
      const b = document.createElement('button');
      b.className = 'cat-tab' + (cat === this.state.cat ? ' active' : '');
      b.textContent = cat;
      b.dataset.cat = cat;
      b.addEventListener('click', () => {
        this.state.cat = cat;
        wrap.querySelectorAll('.cat-tab').forEach(x => x.classList.toggle('active', x.dataset.cat === cat));
        this._renderList();
      });
      wrap.appendChild(b);
    });
  },

  _renderList() {
    const list = $('#exclusion-list');
    const { cat, query } = this.state;
    const q = query;
    const items = this.db.foods.filter(f => {
      if (!f.is_common) return false;
      if (!q && f.category !== cat) return false;
      if (q) {
        const n = (f.name_zh || '').toLowerCase();
        const en = (f.name_en || '').toLowerCase();
        const aliases = (f.name_alias || []).map(a => a.toLowerCase());
        if (!n.includes(q) && !en.includes(q) && !aliases.some(a => a.includes(q))) return false;
      }
      return true;
    });
    list.innerHTML = '';
    if (!items.length) {
      list.innerHTML = '<div class="excl-empty">沒有符合的食材</div>';
      this._updateStat();
      return;
    }
    const frag = document.createDocumentFragment();
    items.forEach(f => {
      const row = document.createElement('div');
      row.className = 'excl-row' + (this.set.has(f.id) ? ' excluded' : '');
      row.dataset.id = f.id;
      const aliases = (f.name_alias && f.name_alias.length) ? `（${f.name_alias.slice(0, 2).join('、')}）` : '';
      row.innerHTML = `
        <div class="excl-info">
          <div class="excl-name">${escapeHtml(f.name_zh)}<span class="muted small">${escapeHtml(aliases)}</span></div>
          <div class="excl-meta"><span class="excl-tag">${escapeHtml(f.category)}</span>GI ${f.gi ?? '—'}${f.gi_confirmed ? '' : ' ⚠估'}</div>
        </div>
        <button class="excl-toggle" aria-label="標記不吃"></button>
      `;
      row.addEventListener('click', () => this._toggle(f.id, row));
      frag.appendChild(row);
    });
    list.appendChild(frag);
    this._updateStat();
  },

  _toggle(id, rowEl) {
    if (this.set.has(id)) {
      this.set.delete(id);
      rowEl.classList.remove('excluded');
    } else {
      this.set.add(id);
      rowEl.classList.add('excluded');
    }
    this._save();
    this._updateCount();
    this._updateStat();
    // 同步影響計算器頁
    if (Calc.db) Calc.renderChips();
  },

  _save() {
    localStorage.setItem('cc_excluded_foods', JSON.stringify([...this.set]));
  },

  _updateCount() {
    const el = $('#exclusion-count');
    if (el) el.textContent = this.set.size;
  },

  _updateStat() {
    const el = $('#exclusion-stat');
    if (!el) return;
    const total = this.db.foods.filter(f => f.is_common).length;
    el.textContent = `已排除 ${this.set.size} / 共 ${total}`;
  },
};

/* ---------- 清除全部資料 ---------- */
function setupDataClear() {
  $('#data-clear-btn').addEventListener('click', () => {
    const ok = confirm('確認清除全部本機資料？\n\n會清掉：\n• 暱稱、I:C 設定、目標 BG\n• Cloudinary 設定\n• 暗色模式偏好\n• 醫療免責勾選紀錄\n\n（紀錄與自訂食材未來會在這裡清；目前 Phase 2 還沒有這些資料）\n\n此動作無法復原。');
    if (!ok) return;
    Object.values(LS).forEach(k => localStorage.removeItem(k));
    showToast('已清除，重新載入中…', 'warn');
    setTimeout(() => location.reload(), 800);
  });
}

/* ---------- Service Worker ---------- */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // file:// 環境下 SW 不會跑，跳過
  if (location.protocol === 'file:') {
    console.info('SW skipped (file:// protocol)');
    return;
  }
  navigator.serviceWorker.register('sw.js')
    .then(reg => console.info('SW registered', reg.scope))
    .catch(err => console.warn('SW registration failed', err));
}

/* ---------- init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  setupTheme();
  setupDisclaimer();
  setupTabs();
  setupRefresh();
  setupPersonalSettings();
  setupPHashSlider();
  setupCloudinary();
  setupDataClear();
  loadFoodDb();
  registerSW();
  console.info(`carb-calc v${APP_VERSION} (${APP_BUILD_DATE}) ready`);
});

/* =============================================================
   Photo helpers — 壓縮、縮圖、dHash
   ============================================================= */
const Photo = {
  /** 壓縮成 max 800px JPEG q0.7，回 Blob */
  async compress(file, maxSize = 800, quality = 0.7) {
    const img = await this._loadImage(file);
    const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
  },

  /** 200px 縮圖 base64 */
  async makeThumb(file, maxSize = 200, quality = 0.6) {
    const img = await this._loadImage(file);
    const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  },

  /** dHash: 9x8 灰階 → 64 bit hash hex */
  async dHash(fileOrBlob) {
    const img = await this._loadImage(fileOrBlob);
    const canvas = document.createElement('canvas');
    canvas.width = 9; canvas.height = 8;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 9, 8);
    const data = ctx.getImageData(0, 0, 9, 8).data;
    // 轉灰階陣列
    const gray = new Array(72);
    for (let i = 0; i < 72; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      gray[i] = (r * 0.299 + g * 0.587 + b * 0.114);
    }
    // 每列相鄰差：左 < 右 = 1
    let bits = '';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const left = gray[row * 9 + col];
        const right = gray[row * 9 + col + 1];
        bits += (left < right ? '1' : '0');
      }
    }
    // 轉 16 進位
    let hex = '';
    for (let i = 0; i < 64; i += 4) {
      hex += parseInt(bits.substr(i, 4), 2).toString(16);
    }
    return hex; // 16 字元 hex（64 bit）
  },

  /** Hamming distance 兩 64-bit hash */
  hamming(a, b) {
    if (!a || !b || a.length !== b.length) return 64;
    let d = 0;
    for (let i = 0; i < a.length; i++) {
      let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
      while (x) { d += x & 1; x >>= 1; }
    }
    return d;
  },

  _loadImage(fileOrBlob) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(fileOrBlob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = e => { URL.revokeObjectURL(url); rej(e); };
      img.src = url;
    });
  },
};

/* =============================================================
   Cloudinary 上傳 + 失敗 fallback
   ============================================================= */
const Uploader = {
  pendingKey: 'cc_pending_uploads',  // localStorage（簡化：v1 不用 IndexedDB）

  async upload(blob, options = {}) {
    const cloud = lsGet(LS.CD_CLOUD, DEFAULT_CLOUDINARY_CLOUD_NAME);
    const preset = lsGet(LS.CD_PRESET, DEFAULT_CLOUDINARY_UPLOAD_PRESET);
    if (!cloud || !preset) throw new Error('Cloudinary 未設定');

    const fd = new FormData();
    fd.append('upload_preset', preset);
    fd.append('file', blob, `meal_${Date.now()}.jpg`);
    if (options.public_id) fd.append('public_id', options.public_id);

    const url = `https://api.cloudinary.com/v1_1/${cloud}/image/upload`;
    const r = await fetch(url, { method: 'POST', body: fd });
    if (!r.ok) {
      const msg = (await r.json().catch(() => ({}))).error?.message || `HTTP ${r.status}`;
      throw new Error(msg);
    }
    return await r.json(); // { secure_url, public_id, ... }
  },

  // 失敗 fallback：暫存 base64 + meal_id
  async queuePending(meal_id, blob) {
    const b64 = await this._blobToB64(blob);
    const queue = this._getPending();
    queue[meal_id] = { b64, queued_at: Date.now() };
    localStorage.setItem(this.pendingKey, JSON.stringify(queue));
  },

  removePending(meal_id) {
    const queue = this._getPending();
    delete queue[meal_id];
    localStorage.setItem(this.pendingKey, JSON.stringify(queue));
  },

  _getPending() {
    try { return JSON.parse(localStorage.getItem(this.pendingKey) || '{}'); }
    catch { return {}; }
  },

  pendingCount() { return Object.keys(this._getPending()).length; },

  // 重試所有 pending
  async retryAll() {
    const queue = this._getPending();
    const ids = Object.keys(queue);
    if (!ids.length) return { tried: 0, success: 0, failed: 0 };
    let success = 0, failed = 0;
    for (const id of ids) {
      try {
        const blob = this._b64ToBlob(queue[id].b64);
        const res = await this.upload(blob);
        // 更新對應 meal 的 photo.url
        Records.markUploaded(id, res.secure_url);
        this.removePending(id);
        success++;
      } catch (e) {
        console.warn('retry upload failed for', id, e);
        failed++;
      }
    }
    return { tried: ids.length, success, failed };
  },

  _blobToB64(blob) {
    return new Promise(res => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.readAsDataURL(blob);
    });
  },

  _b64ToBlob(b64) {
    const [meta, data] = b64.split(',');
    const mime = meta.match(/data:(.*?);/)[1];
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  },
};

/* =============================================================
   Records — 紀錄模組（Phase 4）
   ============================================================= */
const Records = {
  meals: [],
  state: {
    filterMeal: '',
    filterQuery: '',
  },
  formMode: 'new',          // 'new' | 'edit'
  formInputMode: 'foods',   // 'foods' | 'manual'
  editingId: null,
  pendingPhoto: null,       // { blob, thumb_b64, phash }
  formFoods: [],            // [{food, grams}]
  formCtx: new Set(),

  init() {
    this.load();
    this.bindUI();
    this.renderList();
    this.updateFreqMealsCount();
    // 啟動時嘗試重傳
    if (Uploader.pendingCount() > 0) {
      Uploader.retryAll().then(r => {
        if (r.success > 0) {
          showToast(`照片重傳：成功 ${r.success} / 失敗 ${r.failed}`, 'success');
          this.renderList();
        }
      });
    }
  },

  load() {
    try {
      this.meals = JSON.parse(localStorage.getItem('cc_meals') || '[]');
    } catch { this.meals = []; }
    this.meals.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  },

  save() {
    localStorage.setItem('cc_meals', JSON.stringify(this.meals));
    if (typeof Sync !== 'undefined') Sync.schedulePush();
  },

  bindUI() {
    // 搜尋 / filter
    $('#rec-search').addEventListener('input', e => {
      this.state.filterQuery = e.target.value.trim().toLowerCase();
      this.renderList();
    });
    $('#rec-filter-meal').addEventListener('change', e => {
      this.state.filterMeal = e.target.value;
      this.renderList();
    });
    // FAB
    $('#record-fab').addEventListener('click', () => this.openForm({ mode: 'new' }));

    // Form modal
    $('#rf-cancel').addEventListener('click', () => this.closeForm());
    $('#rf-save').addEventListener('click', () => this.saveForm());
    $('#rf-delete').addEventListener('click', () => this.deleteRecord(this.editingId));

    // Meal pills
    $('#rf-meal-pills').addEventListener('click', e => {
      const b = e.target.closest('.meal-pill');
      if (!b) return;
      $$('#rf-meal-pills .meal-pill').forEach(x => x.classList.toggle('active', x === b));
    });

    // 輸入方式切換
    $('#rf-mode-pills').addEventListener('click', e => {
      const b = e.target.closest('.mode-pill');
      if (!b) return;
      this._setInputMode(b.dataset.mode);
    });

    // 手動碳水/GI 輸入
    $('#rf-manual-carb').addEventListener('input', () => this.updateFormTotals());
    $('#rf-manual-gi').addEventListener('input', () => this.updateFormTotals());

    // 食材 picker
    $('#rf-add-food-btn').addEventListener('click', () => this.openFoodPicker());
    $('#fp-close').addEventListener('click', () => $('#food-picker-modal').classList.add('hidden'));

    // Insulin dose
    $('#rf-insulin').addEventListener('input', () => this.updateFormTotals());
    $$('[data-dose-act]').forEach(b => b.addEventListener('click', () => {
      const act = b.dataset.doseAct;
      const inp = $('#rf-insulin');
      let v = parseFloat(inp.value) || 0;
      const delta = { dec1u: -1, dec1: -0.1, inc1: 0.1, inc1u: 1 }[act];
      v = Math.max(0, Math.min(99.9, Math.round((v + delta) * 10) / 10));
      inp.value = v.toFixed(1);
      this.updateFormTotals();
    }));

    // Context tags
    $$('.ctx-tag').forEach(b => b.addEventListener('click', () => {
      const t = b.dataset.ctx;
      if (this.formCtx.has(t)) { this.formCtx.delete(t); b.classList.remove('active'); }
      else { this.formCtx.add(t); b.classList.add('active'); }
    }));

    // 照片相關
    $('#rf-photo-camera-btn').addEventListener('click', () => $('#rf-photo-input').click());
    $('#rf-photo-lib-btn').addEventListener('click', () => $('#rf-photo-input-lib').click());
    $('#rf-photo-remove-btn').addEventListener('click', () => this.removePhoto());
    $('#rf-photo-input').addEventListener('change', e => this.onPhotoSelected(e.target.files[0]));
    $('#rf-photo-input-lib').addEventListener('change', e => this.onPhotoSelected(e.target.files[0]));

    // 相似 modal
    $('#similar-skip').addEventListener('click', () => $('#similar-modal').classList.add('hidden'));

    // 詳情 modal
    $('#rd-close').addEventListener('click', () => $('#record-detail-modal').classList.add('hidden'));
    $('#rd-edit').addEventListener('click', () => {
      const id = $('#record-detail-modal').dataset.id;
      $('#record-detail-modal').classList.add('hidden');
      this.openForm({ mode: 'edit', id });
    });

    // 常吃餐管理
    $('#open-freq-meals-btn').addEventListener('click', () => this.openFreqMeals());
    $('#fm-close').addEventListener('click', () => $('#freq-meals-modal').classList.add('hidden'));
    $('#fm-search').addEventListener('input', () => this.renderFreqMeals());

    // 點擊背景關閉
    ['record-form-modal', 'record-detail-modal', 'similar-modal', 'freq-meals-modal', 'food-picker-modal'].forEach(id => {
      const m = document.getElementById(id);
      if (m) m.addEventListener('click', e => { if (e.target.id === id) m.classList.add('hidden'); });
    });
  },

  /* ===== List ===== */
  renderList() {
    const wrap = $('#records-list');
    const meals = this.filterMeals();
    if (!meals.length) {
      wrap.innerHTML = `<div class="record-empty">
        <p>${this.meals.length ? '沒有符合條件的紀錄' : '還沒有紀錄。從計算器頁挑食材後按「加入紀錄」，或右下角「+」開始第一筆。'}</p>
      </div>`;
      return;
    }
    wrap.innerHTML = '';
    const frag = document.createDocumentFragment();
    // 依日期分組標題
    let lastDate = '';
    meals.forEach(m => {
      const d = (m.date || '').slice(0, 10);
      if (d !== lastDate) {
        lastDate = d;
        const h = document.createElement('div');
        h.className = 'records-date-header muted small';
        h.style.cssText = 'padding:8px 4px 4px;font-weight:600;';
        h.textContent = this._formatDateHeader(d);
        frag.appendChild(h);
      }
      frag.appendChild(this._renderCard(m));
    });
    wrap.appendChild(frag);
  },

  filterMeals() {
    const { filterMeal, filterQuery } = this.state;
    const q = filterQuery;
    return this.meals.filter(m => {
      if (filterMeal && m.meal !== filterMeal) return false;
      if (q && !(m.name || '').toLowerCase().includes(q)) return false;
      return true;
    });
  },

  _renderCard(m) {
    const card = document.createElement('div');
    const peak = Math.max(m.bg_1h || 0, m.bg_2h || 0);
    let kind = '';
    if (peak > 250 || (m.bg_2h && m.bg_2h < 70)) kind = 'danger';
    else if (peak > 180 || (m.bg_2h && m.bg_2h < 80)) kind = 'warn';
    else if (peak > 0) kind = 'good';
    card.className = 'record-card' + (kind ? ' ' + kind : '');
    card.dataset.id = m.id;

    const mealLabel = ({ breakfast: '🌅 早', lunch: '🌞 午', dinner: '🌙 晚', late: '🌃 宵' })[m.meal] || '';
    const time = (m.date || '').slice(11, 16);
    const ic = (m.insulin_u > 0) ? (m.total_carb / m.insulin_u).toFixed(1) : '—';
    const star = m.is_freq ? '⭐ ' : '';
    const peakIcon = kind === 'danger' ? '🔴' : kind === 'warn' ? '⚠️' : kind === 'good' ? '✅' : '';
    const bgStr = (m.bg_pre != null && m.bg_2h != null)
      ? `BG ${m.bg_pre}→${m.bg_1h ?? '—'}→${m.bg_2h} ${peakIcon}`
      : peakIcon ? `BG ${peakIcon}` : '';

    const thumb = m.photo?.thumb_b64
      ? `<img src="${m.photo.thumb_b64}" alt="">`
      : `<span class="record-thumb-placeholder">${this._mealEmoji(m.meal)}</span>`;

    card.innerHTML = `
      <div class="record-thumb">${thumb}</div>
      <div class="record-info">
        <div class="record-meal">${mealLabel} · ${time}</div>
        <div class="record-name">${star}${escapeHtml(m.name || '(無名)')}</div>
        <div class="record-stats">碳水 ${(+m.total_carb).toFixed(1)}g · ${(+m.insulin_u).toFixed(1)} U · 1:${ic} · ${bgStr}</div>
      </div>
    `;
    card.addEventListener('click', () => this.openDetail(m.id));
    return card;
  },

  _mealEmoji(m) {
    return { breakfast: '🌅', lunch: '🌞', dinner: '🌙', late: '🌃' }[m] || '🍴';
  },

  _formatDateHeader(d) {
    if (!d) return '';
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const yest = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
    if (d === todayStr) return '今天 ' + d.slice(5).replace('-', '/');
    if (d === yest) return '昨天 ' + d.slice(5).replace('-', '/');
    return d.slice(5).replace('-', '/');
  },

  /* ===== Form ===== */
  openForm({ mode, id, prefillFoods }) {
    this.formMode = mode;
    this.editingId = id;
    this.pendingPhoto = null;
    this.formCtx.clear();
    this.formInputMode = 'foods';  // 預設食材模式
    $('#rf-manual-carb').value = '';
    $('#rf-manual-gi').value = '';

    let m = null;
    if (mode === 'edit' && id) {
      m = this.meals.find(x => x.id === id);
      if (!m) { showToast('找不到紀錄', 'error'); return; }
    }

    // 預設值
    const now = m ? new Date(m.date) : new Date();
    $('#rf-datetime').value = this._toLocalDT(now);
    $('#rf-title').textContent = mode === 'edit' ? '編輯紀錄' : '新增用餐';
    $('#rf-delete-section').classList.toggle('hidden', mode !== 'edit');

    // 餐別
    const meal = m ? m.meal : this._inferMeal(now);
    $$('#rf-meal-pills .meal-pill').forEach(b =>
      b.classList.toggle('active', b.dataset.meal === meal));

    // 食材 + 輸入模式
    if (mode === 'edit' && m) {
      this.formFoods = (m.foods || []).map(f => ({
        food: this._lookupFood(f.food_id) || { id: f.food_id, name_zh: f.name_zh, carb_100g: 0, gi: f.gi },
        grams: f.grams,
      }));
      // 還原 input mode
      const im = m.input_mode || (m.foods?.length ? 'foods' : 'manual');
      if (im === 'manual') {
        $('#rf-manual-carb').value = m.manual_carb_g != null ? m.manual_carb_g : (m.total_carb || '');
        $('#rf-manual-gi').value = m.manual_gi != null ? m.manual_gi : '';
      }
      this._setInputMode(im);
    } else if (prefillFoods) {
      this.formFoods = prefillFoods.map(s => ({ food: s.food, grams: s.grams }));
      this._setInputMode('foods');
    } else {
      this.formFoods = [];
      this._setInputMode('foods');
    }
    this._renderFormFoods();

    // 餐名
    if (m) {
      $('#rf-name').value = m.name || '';
      $('#rf-name-source').textContent = '✏';
      $('#rf-name-source-text').textContent = '編輯中';
    } else {
      const sug = this.suggestName({ foods: this.formFoods, meal, date: now });
      $('#rf-name').value = sug.name;
      $('#rf-name-source').textContent = sug.icon;
      $('#rf-name-source-text').textContent = sug.label;
    }

    // 劑量、BG、備註
    $('#rf-insulin').value = m ? (m.insulin_u || 0).toFixed(1) : '';
    $('#rf-bg-pre').value = m?.bg_pre ?? '';
    $('#rf-bg-1h').value = m?.bg_1h ?? '';
    $('#rf-bg-2h').value = m?.bg_2h ?? '';
    $('#rf-note').value = m?.note || '';

    // 情境
    (m?.context_tags || []).forEach(t => this.formCtx.add(t));
    $$('.ctx-tag').forEach(b => b.classList.toggle('active', this.formCtx.has(b.dataset.ctx)));

    // 照片
    this._renderPhoto(m?.photo || null);

    this.updateFormTotals();
    $('#record-form-modal').classList.remove('hidden');
  },

  closeForm() {
    $('#record-form-modal').classList.add('hidden');
  },

  _renderFormFoods() {
    const wrap = $('#rf-foods-list');
    if (!this.formFoods.length) {
      wrap.innerHTML = '<p class="empty-hint muted">尚未選食材，可從計算器頁帶入或這邊新增。</p>';
      return;
    }
    wrap.innerHTML = '';
    this.formFoods.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'sel-row';
      const carbG = (s.food.carb_100g || 0) * s.grams / 100;
      row.innerHTML = `
        <div class="sel-info">
          <span class="sel-name">${escapeHtml(s.food.name_zh)}</span>
          <div class="sel-meta">碳水 ${carbG.toFixed(1)}g · GI ${s.food.gi ?? '—'}</div>
        </div>
        <div class="gram-input-wrap">
          <button class="gram-btn" data-act="dec" data-idx="${i}">−</button>
          <input type="number" class="gram-input" min="0" max="9999" step="1" value="${s.grams}" data-idx="${i}" inputmode="numeric">
          <button class="gram-btn" data-act="inc" data-idx="${i}">+</button>
          <span class="gram-unit">g</span>
        </div>
        <button class="sel-remove" data-idx="${i}" aria-label="移除">✕</button>
      `;
      wrap.appendChild(row);
    });
    wrap.querySelectorAll('.gram-input').forEach(el => {
      el.addEventListener('input', () => {
        this.formFoods[+el.dataset.idx].grams = Math.max(0, parseInt(el.value) || 0);
        this._renderFormFoods();
        this.updateFormTotals();
      });
    });
    wrap.querySelectorAll('.gram-btn').forEach(b => {
      b.addEventListener('click', () => {
        const idx = +b.dataset.idx;
        const cur = this.formFoods[idx].grams;
        const delta = b.dataset.act === 'inc' ? 10 : -10;
        this.formFoods[idx].grams = Math.max(0, cur + delta);
        this._renderFormFoods();
        this.updateFormTotals();
      });
    });
    wrap.querySelectorAll('.sel-remove').forEach(b => {
      b.addEventListener('click', () => {
        this.formFoods.splice(+b.dataset.idx, 1);
        this._renderFormFoods();
        this.updateFormTotals();
      });
    });
  },

  updateFormTotals() {
    let carb, netCarb, gi, gl;
    if (this.formInputMode === 'manual') {
      carb = parseFloat($('#rf-manual-carb').value) || 0;
      netCarb = carb;  // 沒纖維資料，視為與總碳水同
      const giIn = parseFloat($('#rf-manual-gi').value);
      gi = Number.isFinite(giIn) ? giIn : null;
      gl = (gi != null && carb > 0) ? gi * carb / 100 : null;
    } else {
      const t = this._calcTotals(this.formFoods);
      carb = t.carb; netCarb = t.netCarb; gi = t.gi; gl = t.gl;
    }
    $('#rf-t-carb').textContent = `${carb.toFixed(1)} g`;
    $('#rf-t-net').textContent = `${netCarb.toFixed(1)} g`;
    $('#rf-t-gi').textContent = gi != null ? gi.toFixed(0) : '—';
    $('#rf-t-gl').textContent = gl != null ? gl.toFixed(0) : '—';
    const dose = parseFloat($('#rf-insulin').value) || 0;
    $('#rf-ic-display').textContent = (dose > 0 && carb > 0) ? `1:${(carb / dose).toFixed(1)}` : '—';
  },

  _setInputMode(mode) {
    this.formInputMode = mode;
    $$('#rf-mode-pills .mode-pill').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === mode));
    $$('.rf-mode-foods').forEach(el => el.classList.toggle('hidden', mode !== 'foods'));
    $$('.rf-mode-manual').forEach(el => el.classList.toggle('hidden', mode !== 'manual'));
    // 切到 manual 時若餐名是「自動產生」(食材 compose)，重置成時段名
    if (mode === 'manual') {
      const nameSrc = $('#rf-name-source').textContent;
      if (nameSrc === '🆕' || nameSrc === '✓') {
        const sug = this.suggestName({ foods: [], meal: this._formMeal(), date: this._formDate() });
        $('#rf-name').value = sug.name;
        $('#rf-name-source').textContent = sug.icon;
        $('#rf-name-source-text').textContent = sug.label;
      }
    }
    this.updateFormTotals();
  },

  _calcTotals(foods) {
    let kcal = 0, carb = 0, fiber = 0, protein = 0, fat = 0, giNum = 0;
    foods.forEach(s => {
      const f = s.food, g = s.grams || 0, scale = g / 100;
      const c = (f.carb_100g || 0) * scale;
      kcal += (f.kcal_100g || 0) * scale;
      carb += c;
      fiber += (f.fiber_100g || 0) * scale;
      protein += (f.protein_100g || 0) * scale;
      fat += (f.fat_100g || 0) * scale;
      const gi = (Calc && Calc._effectiveGi) ? Calc._effectiveGi(f) : f.gi;
      if (gi != null && c > 0) giNum += gi * c;
    });
    const netCarb = Math.max(0, carb - fiber);
    const gi = carb > 0 ? giNum / carb : null;
    const gl = gi != null ? gi * netCarb / 100 : null;
    return { kcal, carb, fiber, netCarb, protein, fat, gi, gl };
  },

  /* ===== 食材 picker ===== */
  fpState: { cat: '主食', query: '' },
  openFoodPicker() {
    this._renderFpCatTabs();
    this._renderFpList();
    $('#fp-search').value = '';
    this.fpState.query = '';
    $('#fp-search').oninput = e => {
      this.fpState.query = e.target.value.trim().toLowerCase();
      this._renderFpList();
    };
    $('#food-picker-modal').classList.remove('hidden');
  },
  _renderFpCatTabs() {
    const wrap = $('#fp-cat-tabs');
    wrap.innerHTML = '';
    Calc.categories.forEach(cat => {
      const has = window._foodDb.foods.some(f => f.is_common && f.category === cat);
      if (!has) return;
      const b = document.createElement('button');
      b.className = 'cat-tab' + (cat === this.fpState.cat ? ' active' : '');
      b.textContent = cat;
      b.dataset.cat = cat;
      b.addEventListener('click', () => {
        this.fpState.cat = cat;
        wrap.querySelectorAll('.cat-tab').forEach(x => x.classList.toggle('active', x.dataset.cat === cat));
        this._renderFpList();
      });
      wrap.appendChild(b);
    });
  },
  _renderFpList() {
    const list = $('#fp-list');
    const { cat, query } = this.fpState;
    const q = query;
    const excluded = Exclusion.set;
    const items = window._foodDb.foods.filter(f => {
      if (!f.is_common) return false;
      if (excluded.has(f.id)) return false;
      if (!q && f.category !== cat) return false;
      if (q) {
        const n = (f.name_zh || '').toLowerCase();
        const en = (f.name_en || '').toLowerCase();
        const aliases = (f.name_alias || []).map(a => a.toLowerCase());
        if (!n.includes(q) && !en.includes(q) && !aliases.some(a => a.includes(q))) return false;
      }
      return true;
    }).slice(0, 200);
    list.innerHTML = '';
    items.forEach(f => {
      const row = document.createElement('div');
      row.className = 'excl-row';
      row.innerHTML = `
        <div class="excl-info">
          <div class="excl-name">${escapeHtml(f.name_zh)}</div>
          <div class="excl-meta"><span class="excl-tag">${escapeHtml(f.category)}</span>碳水 ${(+f.carb_100g).toFixed(1)}/100g · GI ${f.gi ?? '—'}</div>
        </div>
      `;
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        const dg = Calc._defaultGrams(f);
        this.formFoods.push({ food: f, grams: dg });
        this._renderFormFoods();
        this.updateFormTotals();
        $('#food-picker-modal').classList.add('hidden');
      });
      list.appendChild(row);
    });
    if (!items.length) {
      list.innerHTML = '<div class="excl-empty">沒有符合的食材</div>';
    }
  },

  /* ===== 餐名 3 層 fallback ===== */
  suggestName({ foods, meal, date, photoPhash }) {
    // 1. 照片 phash 比對（≤8）
    if (photoPhash) {
      const cutoff = parseInt(lsGet(LS.PHASH_TH, '8')) || 8;
      const recent = this._recent30dWithPhotos();
      const matched = recent
        .map(m => ({ m, d: Photo.hamming(photoPhash, m.photo.phash) }))
        .filter(x => x.d <= cutoff)
        .sort((a, b) => a.d - b.d);
      if (matched.length) {
        return { name: matched[0].m.name, icon: '📷', label: '照片相似自動帶' };
      }
    }
    // 2. 食材匹配（集合相同 + 克數差 < 10%）
    if (foods?.length) {
      const ids = foods.map(s => s.food.id).sort().join('|');
      for (const m of this.meals) {
        const mIds = (m.foods || []).map(x => x.food_id).sort().join('|');
        if (mIds !== ids) continue;
        let allClose = true;
        for (const s of foods) {
          const mf = m.foods.find(x => x.food_id === s.food.id);
          if (!mf || Math.abs(s.grams - mf.grams) / Math.max(s.grams, mf.grams, 1) > 0.10) {
            allClose = false; break;
          }
        }
        if (allClose) return { name: m.name, icon: '✓', label: '食材組合相符' };
      }
    }
    // 3. 自動 compose（碳水佔比前 3 食材）
    if (foods?.length) {
      const ranked = foods
        .map(s => ({ name: s.food.name_zh, carbG: (s.food.carb_100g || 0) * (s.grams || 0) / 100 }))
        .filter(x => x.carbG > 0.5)
        .sort((a, b) => b.carbG - a.carbG)
        .slice(0, 3);
      if (ranked.length) {
        return { name: ranked.map(x => x.name).join(' + '), icon: '🆕', label: '自動產生（前 3 食材）' };
      }
    }
    // 4. 退路：時段名
    const mealLabel = ({ breakfast: '早餐', lunch: '午餐', dinner: '晚餐', late: '宵夜' })[meal] || '餐';
    const dateStr = (date || new Date()).toISOString().slice(5, 10).replace('-', '');
    return { name: `${mealLabel} ${dateStr}`, icon: '🆕', label: '時段命名' };
  },

  _recent30dWithPhotos() {
    const cutoff = Date.now() - 30 * 86400000;
    return this.meals.filter(m => m.photo?.phash && new Date(m.date).getTime() >= cutoff);
  },

  _inferMeal(d) {
    const h = d.getHours();
    if (h >= 5 && h < 10) return 'breakfast';
    if (h >= 10 && h < 15) return 'lunch';
    if (h >= 15 && h < 21) return 'dinner';
    return 'late';
  },

  _toLocalDT(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  _lookupFood(id) {
    return window._foodDb?.foods.find(f => f.id === id);
  },

  /* ===== 照片 ===== */
  async onPhotoSelected(file) {
    if (!file) return;
    const status = $('#rf-photo-status');
    status.textContent = '處理中…';
    try {
      const blob = await Photo.compress(file);
      const thumb_b64 = await Photo.makeThumb(file);
      const phash = await Photo.dHash(file);
      this.pendingPhoto = { blob, thumb_b64, phash };

      // 顯示縮圖
      $('#rf-photo-img').src = thumb_b64;
      $('#rf-photo-preview').classList.remove('hidden');
      $('#rf-photo-remove-btn').hidden = false;
      status.textContent = `已壓縮（${Math.round(blob.size / 1024)} KB）`;

      // 自動跑相似比對
      const cutoff = parseInt(lsGet(LS.PHASH_TH, '8')) || 8;
      const recent = this._recent30dWithPhotos();
      const matches = recent
        .map(m => ({ m, d: Photo.hamming(phash, m.photo.phash) }))
        .filter(x => x.d <= 12)
        .sort((a, b) => a.d - b.d)
        .slice(0, 3);
      if (matches.length && matches[0].d <= cutoff) {
        this._showSimilarModal(matches);
      } else if (!$('#rf-name').value || $('#rf-name').value.match(/^(早|午|晚|宵).+\d{4}$/)) {
        // 重新建議名（會用照片 phash）
        const sug = this.suggestName({ foods: this.formFoods, meal: this._formMeal(), date: this._formDate(), photoPhash: phash });
        $('#rf-name').value = sug.name;
        $('#rf-name-source').textContent = sug.icon;
        $('#rf-name-source-text').textContent = sug.label;
      }
    } catch (e) {
      console.error(e);
      status.textContent = '✕ 處理失敗';
      showToast('照片處理失敗', 'error');
    }
  },

  removePhoto() {
    this.pendingPhoto = null;
    $('#rf-photo-preview').classList.add('hidden');
    $('#rf-photo-remove-btn').hidden = true;
    $('#rf-photo-input').value = '';
    $('#rf-photo-input-lib').value = '';
  },

  _renderPhoto(photo) {
    if (photo?.thumb_b64 || photo?.url) {
      $('#rf-photo-img').src = photo.thumb_b64 || photo.url;
      $('#rf-photo-preview').classList.remove('hidden');
      $('#rf-photo-remove-btn').hidden = false;
      $('#rf-photo-status').textContent = photo.upload_pending ? '⚠ 上傳中或失敗，會自動重試' : '已上傳';
      this.pendingPhoto = null; // 編輯時若沒換照片則保留原來
    } else {
      $('#rf-photo-preview').classList.add('hidden');
      $('#rf-photo-remove-btn').hidden = true;
      $('#rf-photo-status').textContent = '';
    }
  },

  _showSimilarModal(matches) {
    const list = $('#similar-list');
    list.innerHTML = '';
    matches.forEach(({ m, d }) => {
      const sim = Math.round((64 - d) / 64 * 100);
      const item = document.createElement('div');
      item.className = 'similar-item';
      item.innerHTML = `
        <img src="${m.photo.thumb_b64 || m.photo.url}" alt="">
        <div class="info" style="flex:1;min-width:0;">
          <div class="si-name">${escapeHtml(m.name)}</div>
          <div class="si-meta">${(m.date || '').slice(5, 16).replace('T', ' ')} · ${(+m.insulin_u).toFixed(1)}U · BG ${m.bg_2h || '—'}</div>
          <div class="si-score">相似度 ${sim}%（d=${d}）</div>
        </div>
      `;
      item.addEventListener('click', () => {
        $('#rf-name').value = m.name;
        $('#rf-name-source').textContent = '📷';
        $('#rf-name-source-text').textContent = '照片相似度匹配';
        $('#similar-modal').classList.add('hidden');
      });
      list.appendChild(item);
    });
    $('#similar-modal').classList.remove('hidden');
  },

  _formMeal() {
    const active = document.querySelector('#rf-meal-pills .meal-pill.active');
    return active ? active.dataset.meal : 'lunch';
  },
  _formDate() {
    const v = $('#rf-datetime').value;
    return v ? new Date(v) : new Date();
  },

  /* ===== Save ===== */
  async saveForm() {
    const name = $('#rf-name').value.trim();
    if (!name) {
      showToast('請填餐名', 'warn');
      $('#rf-name').focus();
      $('#rf-name').style.borderColor = 'var(--c-red)';
      setTimeout(() => $('#rf-name').style.borderColor = '', 2000);
      return;
    }

    // 依 input mode 驗證
    const isManual = this.formInputMode === 'manual';
    if (isManual) {
      const mc = parseFloat($('#rf-manual-carb').value);
      if (!Number.isFinite(mc) || mc <= 0) {
        showToast('請填總碳水量（g）', 'warn', 3500);
        $('#rf-manual-carb').focus();
        $('#rf-manual-carb').style.borderColor = 'var(--c-red)';
        setTimeout(() => $('#rf-manual-carb').style.borderColor = '', 2500);
        return;
      }
    } else {
      if (!this.formFoods.length) {
        showToast('至少選一個食材（或切到「✏ 手動輸入碳水」）', 'warn', 3500);
        $('#rf-add-food-btn').focus();
        $('#rf-add-food-btn').style.outline = '3px solid var(--c-red)';
        setTimeout(() => $('#rf-add-food-btn').style.outline = '', 2500);
        return;
      }
    }

    const dt = $('#rf-datetime').value;
    if (!dt) {
      showToast('請選日期時間', 'warn');
      $('#rf-datetime').focus();
      return;
    }

    // 計算總計（依 mode）
    let t;
    if (isManual) {
      const mc = parseFloat($('#rf-manual-carb').value) || 0;
      const mgi = parseFloat($('#rf-manual-gi').value);
      const giVal = Number.isFinite(mgi) ? mgi : null;
      t = {
        kcal: 0, carb: mc, fiber: 0, netCarb: mc,
        protein: 0, fat: 0,
        gi: giVal,
        gl: (giVal != null) ? giVal * mc / 100 : null,
      };
    } else {
      t = this._calcTotals(this.formFoods);
    }
    const insulin = parseFloat($('#rf-insulin').value) || 0;
    const meal = this._formMeal();

    const id = this.editingId || this._uuid();

    // 處理照片：新拍 → 先暫存 b64 + 嘗試上傳
    let photo = null;
    const existing = (this.formMode === 'edit') ? this.meals.find(x => x.id === id)?.photo : null;

    if (this.pendingPhoto) {
      photo = {
        url: null,
        phash: this.pendingPhoto.phash,
        thumb_b64: this.pendingPhoto.thumb_b64,
        upload_pending: true,
      };
    } else if (existing) {
      photo = existing;
    }

    const meal_obj = {
      id,
      date: dt,
      meal,
      name,
      input_mode: isManual ? 'manual' : 'foods',
      manual_carb_g: isManual ? +t.carb.toFixed(1) : null,
      manual_gi: isManual ? t.gi : null,
      foods: isManual ? [] : this.formFoods.map(s => ({
        food_id: s.food.id,
        name_zh: s.food.name_zh,
        grams: s.grams,
        carb_g: (s.food.carb_100g || 0) * s.grams / 100,
        gi: s.food.gi,
      })),
      total_kcal: +t.kcal.toFixed(1),
      total_carb: +t.carb.toFixed(2),
      total_net_carb: +t.netCarb.toFixed(2),
      total_protein: +t.protein.toFixed(1),
      total_fat: +t.fat.toFixed(1),
      weighted_gi: t.gi != null ? +t.gi.toFixed(1) : null,
      gl: t.gl != null ? +t.gl.toFixed(1) : null,
      insulin_u: +insulin.toFixed(1),
      ic_ratio: insulin > 0 ? +(t.carb / insulin).toFixed(2) : null,
      bolus_type: 'normal',
      bg_pre: this._numOr(null, $('#rf-bg-pre').value),
      bg_1h: this._numOr(null, $('#rf-bg-1h').value),
      bg_2h: this._numOr(null, $('#rf-bg-2h').value),
      context_tags: [...this.formCtx],
      note: $('#rf-note').value.trim(),
      photo,
      created_at: existing ? this.meals.find(x => x.id === id)?.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // 加入 / 更新
    const idx = this.meals.findIndex(x => x.id === id);
    if (idx >= 0) this.meals[idx] = meal_obj;
    else this.meals.unshift(meal_obj);
    this.meals.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    this.save();

    this.closeForm();
    this.renderList();
    this.updateFreqMealsCount();

    // 排 1h/2h BG 提醒（如果新建 + 缺 2h BG + 設定有開）
    const isNew = this.formMode !== 'edit';
    if (isNew && (meal_obj.bg_2h == null) && Reminder.enabled()) {
      Reminder.scheduleAfterSave(meal_obj);
    } else {
      showToast(this.formMode === 'edit' ? '已更新紀錄' : '已新增紀錄', 'success');
    }

    // 觸發 Cloudinary 上傳（背景）
    if (this.pendingPhoto && photo?.upload_pending) {
      this._uploadPendingPhoto(id, this.pendingPhoto.blob);
    }
  },

  async _uploadPendingPhoto(meal_id, blob) {
    try {
      const res = await Uploader.upload(blob);
      this.markUploaded(meal_id, res.secure_url);
      showToast('照片上傳成功', 'success', 1500);
    } catch (e) {
      console.warn('upload failed', e);
      await Uploader.queuePending(meal_id, blob);
      showToast('照片上傳失敗，已暫存稍後重試', 'warn');
    }
  },

  markUploaded(meal_id, url) {
    const m = this.meals.find(x => x.id === meal_id);
    if (!m || !m.photo) return;
    m.photo.url = url;
    m.photo.upload_pending = false;
    this.save();
    this.renderList();
  },

  _numOr(d, v) {
    const n = parseInt(v);
    return Number.isFinite(n) ? n : d;
  },

  _uuid() {
    return 'm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  },

  /* ===== Detail ===== */
  openDetail(id) {
    const m = this.meals.find(x => x.id === id);
    if (!m) return;
    const body = $('#rd-body');
    const peak = Math.max(m.bg_1h || 0, m.bg_2h || 0);
    const bgClass = (v, low = 70, high = 180) =>
      v == null ? '' : (v < low ? 'high' : v > high ? 'warn' : '');

    const photoEl = m.photo?.url ? `<img class="rd-photo" src="${m.photo.url}" alt="">` :
                    m.photo?.thumb_b64 ? `<img class="rd-photo" src="${m.photo.thumb_b64}" alt="">` : '';

    const isManual = (m.input_mode === 'manual') || (!m.foods?.length);
    const foodsHtml = isManual
      ? `<div class="sel-row" style="background:var(--bg-page);">
           <div class="sel-info">
             <div class="sel-name">✏ 手動輸入碳水</div>
             <div class="sel-meta">總碳水 ${(+m.total_carb).toFixed(1)}g${m.weighted_gi ? ` · GI ${m.weighted_gi}` : ''}（無食材組成）</div>
           </div>
         </div>`
      : (m.foods || []).map(f => `
      <div class="sel-row">
        <div class="sel-info">
          <div class="sel-name">${escapeHtml(f.name_zh)}</div>
          <div class="sel-meta">${f.grams}g · 碳水 ${(+f.carb_g).toFixed(1)}g · GI ${f.gi ?? '—'}</div>
        </div>
      </div>
    `).join('');

    const histHtml = this._renderHistory(m);
    const suggestHtml = this._renderSuggest(m);

    body.innerHTML = `
      ${photoEl}
      ${suggestHtml}
      <div class="rd-info-grid">
        <div class="rd-cell"><div class="lbl">日期時間</div><div class="val">${(m.date || '').replace('T', ' ')}</div></div>
        <div class="rd-cell"><div class="lbl">餐別</div><div class="val">${this._mealEmoji(m.meal)} ${({breakfast:'早餐',lunch:'午餐',dinner:'晚餐',late:'宵夜'})[m.meal]||''}</div></div>
        <div class="rd-cell"><div class="lbl">總碳水</div><div class="val">${(+m.total_carb).toFixed(1)} g</div></div>
        <div class="rd-cell"><div class="lbl">淨碳水</div><div class="val">${(+m.total_net_carb).toFixed(1)} g</div></div>
        <div class="rd-cell"><div class="lbl">胰島素</div><div class="val">${(+m.insulin_u).toFixed(1)} U</div></div>
        <div class="rd-cell"><div class="lbl">I:C</div><div class="val">${m.ic_ratio != null ? '1:'+(+m.ic_ratio).toFixed(1) : '—'}</div></div>
        <div class="rd-cell"><div class="lbl">加權 GI</div><div class="val">${m.weighted_gi ?? '—'}</div></div>
        <div class="rd-cell"><div class="lbl">GL</div><div class="val ${m.gl >= 20 ? 'high' : m.gl >= 10 ? 'warn' : ''}">${m.gl ?? '—'}</div></div>
      </div>
      <div class="rd-bg-row">
        <div class="rd-bg-cell"><div class="lbl">餐前</div><div class="val ${bgClass(m.bg_pre)}">${m.bg_pre ?? '—'}</div></div>
        <div class="rd-bg-cell"><div class="lbl">1h</div><div class="val ${bgClass(m.bg_1h)}">${m.bg_1h ?? '—'}</div></div>
        <div class="rd-bg-cell"><div class="lbl">2h</div><div class="val ${bgClass(m.bg_2h)}">${m.bg_2h ?? '—'}</div></div>
      </div>
      ${m.context_tags?.length ? `<div class="muted small" style="margin-bottom:10px;">情境：${m.context_tags.join('、')}</div>` : ''}
      ${m.note ? `<div class="muted small" style="margin-bottom:10px;padding:8px;background:var(--bg-page);border-radius:8px;">📝 ${escapeHtml(m.note)}</div>` : ''}
      <h3 class="section-title">食材</h3>
      <div class="rd-foods-list">${foodsHtml}</div>
      ${histHtml}
      <div class="rd-actions">
        <button class="btn-secondary" id="rd-duplicate">📋 複製為新</button>
        <button class="btn-danger" id="rd-delete">🗑 刪除</button>
      </div>
    `;
    $('#record-detail-modal').dataset.id = id;
    $('#rd-title').textContent = m.name;
    $('#record-detail-modal').classList.remove('hidden');

    // 複製/刪除事件
    body.querySelector('#rd-duplicate').addEventListener('click', () => this.duplicateRecord(id));
    body.querySelector('#rd-delete').addEventListener('click', () => this.deleteRecord(id));
  },

  _renderSuggest(m) {
    const s = this.suggestDoseAdjust(m.name);
    if (s.kind === 'insufficient') {
      const need = 3 - s.n;
      if (s.n === 0) return '';
      return `<div class="suggest-card insufficient">
        <div class="suggest-title">📊 同餐 ${s.n} 筆紀錄${s.reason==='no-bg'?'（沒 BG）':''}</div>
        <p class="muted small">需要 ${need} 筆才能給建議劑量。先記錄後，演算法會自動學妳對這道菜的反應。</p>
      </div>`;
    }
    const dirIcon = s.direction === 'increase' ? '↑' : s.direction === 'decrease' ? '↓' : '→';
    const dirText = s.direction === 'increase' ? '加量' : s.direction === 'decrease' ? '減量' : '維持';
    const peakKind = s.avgPeak > 250 ? 'danger' : s.avgPeak > 180 ? 'warn' : s.avgPeak < 70 ? 'danger' : s.avgPeak < 80 ? 'warn' : 'good';
    const confLabel = ({low:'低',medium:'中',high:'高'})[s.confidence];
    const deltaStr = s.delta === 0 ? '' : (s.delta > 0 ? '+' : '') + s.delta.toFixed(1);
    return `<div class="suggest-card ${s.direction}">
      <div class="suggest-title">💡 下次建議劑量</div>
      <div class="suggest-main">
        <div class="suggest-dose">${s.suggestedDose.toFixed(1)} <small>U</small></div>
        <div class="suggest-meta">
          <div>${dirIcon} ${dirText}${deltaStr ? `（上次 ${s.lastDose.toFixed(1)}U ${deltaStr}）` : ''}</div>
          <div class="muted small">同餐 ${s.n} 筆 · 平均 1:${s.avgIc?.toFixed(1) ?? '—'} · 平均餐後峰值 <span class="bg-${peakKind}">${s.avgPeak} mg/dL</span></div>
        </div>
      </div>
      <p class="suggest-conf small ${s.confidence}">信心：${confLabel}（${s.n} 筆紀錄${s.n>=7?'，已穩定':s.n>=3?'，初步':'，樣本少'}）</p>
      <p class="suggest-disclaimer">⚠ 統計輔助，最終劑量請與醫師確認。</p>
    </div>`;
  },

  _renderHistory(m) {
    const sameName = this.meals.filter(x => x.id !== m.id && x.name === m.name).slice(0, 5);
    if (!sameName.length) return '';
    const rows = sameName.map(x => `
      <div class="sel-row" style="cursor:pointer;" data-id="${x.id}">
        <div class="sel-info">
          <div class="sel-name">${(x.date || '').slice(5, 10).replace('-', '/')} · ${(x.date || '').slice(11, 16)}</div>
          <div class="sel-meta">${(+x.insulin_u).toFixed(1)}U · 1:${x.ic_ratio?.toFixed(1) || '—'} · BG ${x.bg_2h || '—'}</div>
        </div>
      </div>
    `).join('');
    return `<h3 class="section-title">同餐歷史（${sameName.length} 筆）</h3>
            <div class="rd-foods-list">${rows}</div>`;
  },

  duplicateRecord(id) {
    const m = this.meals.find(x => x.id === id);
    if (!m) return;
    const prefill = m.foods.map(f => ({
      food: this._lookupFood(f.food_id) || { id: f.food_id, name_zh: f.name_zh, carb_100g: 0, gi: f.gi },
      grams: f.grams,
    }));
    $('#record-detail-modal').classList.add('hidden');
    this.openForm({ mode: 'new', prefillFoods: prefill });
    setTimeout(() => {
      $('#rf-name').value = m.name;
      $('#rf-name-source').textContent = '📋';
      $('#rf-name-source-text').textContent = '從歷史複製';
    }, 100);
  },

  deleteRecord(id) {
    if (!confirm('確認刪除這筆紀錄？無法復原。')) return;
    this.meals = this.meals.filter(x => x.id !== id);
    this.save();
    this.closeForm();
    $('#record-detail-modal').classList.add('hidden');
    this.renderList();
    this.updateFreqMealsCount();
    showToast('已刪除', 'warn');
  },

  /* ===== 常吃餐 ===== */
  openFreqMeals() {
    this.renderFreqMeals();
    $('#freq-meals-modal').classList.remove('hidden');
  },
  renderFreqMeals() {
    const groups = {};
    this.meals.forEach(m => {
      const k = m.name || '(無名)';
      groups[k] = groups[k] || { name: k, count: 0, ic_total: 0, ic_n: 0, bg2_total: 0, bg2_n: 0, last: m.date };
      groups[k].count++;
      if (m.ic_ratio) { groups[k].ic_total += m.ic_ratio; groups[k].ic_n++; }
      if (m.bg_2h)    { groups[k].bg2_total += m.bg_2h; groups[k].bg2_n++; }
      if ((m.date || '') > (groups[k].last || '')) groups[k].last = m.date;
    });
    const q = $('#fm-search').value.trim().toLowerCase();
    const list = Object.values(groups)
      .filter(g => !q || g.name.toLowerCase().includes(q))
      .sort((a, b) => b.count - a.count);

    const wrap = $('#fm-list');
    wrap.innerHTML = '';
    if (!list.length) {
      wrap.innerHTML = '<div class="excl-empty">還沒有任何紀錄</div>';
    } else {
      list.forEach(g => {
        const avgIc = g.ic_n ? (g.ic_total / g.ic_n).toFixed(1) : '—';
        const avgBg = g.bg2_n ? Math.round(g.bg2_total / g.bg2_n) : '—';
        const row = document.createElement('div');
        row.className = 'fm-row';
        row.innerHTML = `
          <div class="fm-info">
            <div class="fm-name">${escapeHtml(g.name)}</div>
            <div class="fm-stats">平均 1:${avgIc} · 平均 2h BG ${avgBg} · 最近 ${(g.last||'').slice(5,10)}</div>
          </div>
          <span class="fm-count">${g.count}</span>
        `;
        row.addEventListener('click', () => {
          // 篩選紀錄列表為該餐名
          this.state.filterQuery = g.name;
          $('#rec-search').value = g.name;
          this.renderList();
          $('#freq-meals-modal').classList.add('hidden');
          $('#nav-records').click();
        });
        wrap.appendChild(row);
      });
    }
    $('#fm-stat').textContent = `${list.length} 道餐 / ${this.meals.length} 筆紀錄`;
  },
  updateFreqMealsCount() {
    const set = new Set(this.meals.map(m => m.name));
    const el = $('#freq-meals-count');
    if (el) el.textContent = set.size;
  },

  /* ===== Phase 5: I:C 推算演算法 ===== */
  /**
   * 對某餐名給「下次建議劑量」。
   * 樣本 < 3 → insufficient
   * 平均餐後峰值（max(1h, 2h)）：
   *   < 70 → 減量
   *   70-140 → 維持
   *   140-180 → 加量（小）
   *   > 180 → 加量（中）
   * 幅度依樣本數：
   *   3-6: ±0.2-0.3U
   *   ≥7: ±0.5U
   */
  suggestDoseAdjust(mealName) {
    const history = this.meals
      .filter(m => m.name === mealName && m.insulin_u > 0)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (history.length < 3) {
      return { kind: 'insufficient', n: history.length };
    }

    const recent = history.slice(0, 7);
    const peaks = recent
      .map(m => Math.max(m.bg_1h || 0, m.bg_2h || 0))
      .filter(p => p > 0);
    if (!peaks.length) {
      return { kind: 'insufficient', n: history.length, reason: 'no-bg' };
    }
    const avgPeak = peaks.reduce((a, b) => a + b, 0) / peaks.length;
    const icArr = recent.filter(m => m.ic_ratio).map(m => m.ic_ratio);
    const avgIc = icArr.length ? icArr.reduce((a, b) => a + b, 0) / icArr.length : null;

    let direction = 'maintain';
    let level = 0;
    if (avgPeak > 250)      { direction = 'increase'; level = 2; }
    else if (avgPeak > 180) { direction = 'increase'; level = 2; }
    else if (avgPeak > 140) { direction = 'increase'; level = 1; }
    else if (avgPeak < 70)  { direction = 'decrease'; level = 2; }
    else if (avgPeak < 80)  { direction = 'decrease'; level = 1; }

    const N = history.length;
    let mag = 0;
    if (direction !== 'maintain') {
      if (N < 3) mag = 0;
      else if (N < 7) mag = level === 1 ? 0.2 : 0.3;
      else mag = 0.5;
    }
    const sign = direction === 'increase' ? 1 : direction === 'decrease' ? -1 : 0;
    const delta = +(sign * mag).toFixed(1);

    const lastDose = history[0].insulin_u;
    const suggestedDose = Math.max(0, +(lastDose + delta).toFixed(1));

    let confidence = 'low';
    if (N >= 7) confidence = 'high';
    else if (N >= 3) confidence = 'medium';

    return {
      kind: 'suggest',
      n: N,
      n_with_bg: peaks.length,
      avgPeak: Math.round(avgPeak),
      avgIc: avgIc != null ? +avgIc.toFixed(1) : null,
      direction,
      delta,
      lastDose,
      suggestedDose,
      confidence,
    };
  },

  trendData(days = 30) {
    const cutoff = Date.now() - days * 86400000;
    return this.meals.filter(m => new Date(m.date).getTime() >= cutoff);
  },
};

/* =============================================================
   Reminder — 餐後 BG 提醒（Web Notification + iCal）
   ============================================================= */
const Reminder = {
  pendingTimers: {},  // { 'meal_id-1h': timeoutId }

  init() {
    const toggle = $('#set-reminder-on');
    if (toggle) {
      toggle.checked = lsGet('cc_reminder_on', '0') === '1';
      toggle.addEventListener('change', () => {
        lsSet('cc_reminder_on', toggle.checked ? '1' : '0');
        if (toggle.checked && 'Notification' in window && Notification.permission === 'default') {
          this.requestPermission();
        }
      });
    }
    const permBtn = $('#reminder-permission');
    if (permBtn) permBtn.addEventListener('click', () => this.requestPermission());
    const testBtn = $('#test-notification');
    if (testBtn) testBtn.addEventListener('click', () => this.testNotification());
    this._renderPermStatus();
  },

  enabled() { return lsGet('cc_reminder_on', '0') === '1'; },

  _renderPermStatus() {
    const el = $('#reminder-perm-status');
    if (!el) return;
    if (!('Notification' in window)) {
      el.textContent = '✕ 此瀏覽器不支援 Web 通知';
      el.className = 'status-line danger';
      return;
    }
    const p = Notification.permission;
    if (p === 'granted') {
      el.textContent = '✓ 已允許 Web 通知（PWA 開著時可跳）';
      el.className = 'status-line success';
    } else if (p === 'denied') {
      el.textContent = '✕ 已拒絕。Safari → 設定 → 網站 → yuyunu.github.io 解除';
      el.className = 'status-line danger';
    } else {
      el.textContent = '尚未授權，按「允許通知」';
      el.className = 'status-line muted';
    }
  },

  async requestPermission() {
    if (!('Notification' in window)) return showToast('此瀏覽器不支援通知', 'error');
    const r = await Notification.requestPermission();
    this._renderPermStatus();
    if (r === 'granted') showToast('已允許通知', 'success');
    else showToast('未允許通知', 'warn');
  },

  testNotification() {
    if (!('Notification' in window)) return showToast('不支援', 'error');
    if (Notification.permission !== 'granted') return showToast('請先允許通知', 'warn');
    new Notification('🩸 carb-calc 測試通知', {
      body: 'Web 通知運作正常。實際 1h/2h 提醒會在妳存紀錄後自動排程。',
      icon: 'icons/icon-192.png',
    });
  },

  /** 存完餐後呼叫：排 setTimeout + 給 .ics 下載按鈕 */
  scheduleAfterSave(meal) {
    if (!this.enabled()) return;

    // 1. 排 setTimeout（PWA 開著時會跳）
    const now = Date.now();
    const mealTime = new Date(meal.date).getTime();
    const ms1h = mealTime + 60 * 60 * 1000 - now;
    const ms2h = mealTime + 120 * 60 * 1000 - now;

    if ('Notification' in window && Notification.permission === 'granted') {
      if (ms1h > 0) {
        const t1 = setTimeout(() => {
          new Notification(`🩸 量 BG（餐後 1h）`, {
            body: meal.name,
            icon: 'icons/icon-192.png',
            tag: `bg-1h-${meal.id}`,
            requireInteraction: false,
          });
        }, ms1h);
        this.pendingTimers[meal.id + '-1h'] = t1;
      }
      if (ms2h > 0) {
        const t2 = setTimeout(() => {
          new Notification(`🩸 量 BG（餐後 2h）`, {
            body: meal.name,
            icon: 'icons/icon-192.png',
            tag: `bg-2h-${meal.id}`,
            requireInteraction: false,
          });
        }, ms2h);
        this.pendingTimers[meal.id + '-2h'] = t2;
      }
    }

    // 2. 提供 .ics 下載連結 toast（最可靠：iPhone 行事曆即使 PWA 關了也會跳）
    if (ms2h <= 0) return;  // 兩個時間都過了
    this._showICSToast(meal);
  },

  _showICSToast(meal) {
    const t = $('#toast');
    t.innerHTML = `已存紀錄 · 1h/2h 提醒已排 <button id="dl-ics" style="margin-left:8px;padding:4px 10px;border-radius:6px;background:white;color:var(--c-dark-brown);font-weight:700;border:none;font-size:13px;">📅 加到行事曆</button>`;
    t.className = 'toast success';
    t.classList.remove('hidden');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => t.classList.add('hidden'), 8000);
    document.getElementById('dl-ics').addEventListener('click', e => {
      e.stopPropagation();
      this.downloadICS(meal);
      t.classList.add('hidden');
    });
  },

  /** 產生 .ics 並觸發下載；iPhone Safari 點下載會跳行事曆「加入」 prompt */
  downloadICS(meal) {
    const start1h = new Date(meal.date);
    start1h.setHours(start1h.getHours() + 1);
    const end1h = new Date(start1h.getTime() + 5 * 60000);
    const start2h = new Date(meal.date);
    start2h.setHours(start2h.getHours() + 2);
    const end2h = new Date(start2h.getTime() + 5 * 60000);
    const fmt = d => d.toISOString().replace(/[-:]|\.\d{3}/g, '');
    const stamp = fmt(new Date());

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//carb-calc//meal-reminder//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:meal-1h-${meal.id}@carb-calc`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${fmt(start1h)}`,
      `DTEND:${fmt(end1h)}`,
      `SUMMARY:🩸 量 BG (餐後 1h) — ${this._escIcs(meal.name)}`,
      `DESCRIPTION:來自 carb-calc：請量血糖並回填紀錄`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-PT0M',
      'DESCRIPTION:量 BG (1h)',
      'END:VALARM',
      'END:VEVENT',
      'BEGIN:VEVENT',
      `UID:meal-2h-${meal.id}@carb-calc`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${fmt(start2h)}`,
      `DTEND:${fmt(end2h)}`,
      `SUMMARY:🩸 量 BG (餐後 2h) — ${this._escIcs(meal.name)}`,
      `DESCRIPTION:來自 carb-calc：請量血糖並回填紀錄`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-PT0M',
      'DESCRIPTION:量 BG (2h)',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bg-reminder-${meal.id}.ics`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
    showToast('已下載行事曆檔，請點開讓 iPhone 加入提醒', 'success', 4500);
  },

  _escIcs(s) {
    return String(s).replace(/[\\,;]/g, x => '\\' + x).replace(/\n/g, '\\n');
  },
};

/* =============================================================
   Sync — GitHub Gist 同步（Phase 6）
   ============================================================= */
const Sync = {
  GIST_FILENAME: 'carb-calc-sync.json',
  pushTimer: null,
  syncing: false,

  async init() {
    this.bindUI();
    this._renderStatus();
    // 開 app 自動 pull（如果有 PAT）
    if (this._hasPAT()) {
      try { await this.pull({ silent: true }); }
      catch (e) { console.warn('initial pull failed', e); }
    }
  },

  _hasPAT() {
    return !!lsGet('cc_gh_pat');
  },

  _gistId() {
    return lsGet('cc_gist_id');
  },

  _setStatus(text, kind = 'muted') {
    const el = $('#sync-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'status-line ' + (kind === 'success' ? 'success' :
                                      kind === 'error' ? 'danger' :
                                      kind === 'warn' ? 'warn' : 'muted');
  },

  _renderStatus() {
    const el = $('#sync-status');
    const idEl = $('#sync-gist-id');
    const lastEl = $('#sync-last');
    if (!el) return;
    if (!this._hasPAT()) {
      this._setStatus('未設定');
      if (idEl) idEl.textContent = '—';
      if (lastEl) lastEl.textContent = '—';
      return;
    }
    const gid = this._gistId();
    const last = lsGet('cc_gist_last_sync');
    if (idEl) idEl.textContent = gid ? gid.slice(0, 8) + '…' : '尚未建立';
    if (lastEl) lastEl.textContent = last ? this._timeAgo(last) : '從未';
    this._setStatus(gid ? '✓ 已連線' : '⚠ 已設 PAT，待建立 Gist', gid ? 'success' : 'warn');
  },

  _timeAgo(iso) {
    const t = new Date(iso).getTime();
    const sec = Math.round((Date.now() - t) / 1000);
    if (sec < 60) return '剛剛';
    if (sec < 3600) return Math.round(sec / 60) + ' 分鐘前';
    if (sec < 86400) return Math.round(sec / 3600) + ' 小時前';
    return Math.round(sec / 86400) + ' 天前';
  },

  bindUI() {
    const patInput = $('#sync-pat');
    if (!patInput) return;
    patInput.value = lsGet('cc_gh_pat') || '';
    patInput.addEventListener('change', () => {
      const v = patInput.value.trim();
      if (v) lsSet('cc_gh_pat', v);
      else localStorage.removeItem('cc_gh_pat');
      this._renderStatus();
    });
    $('#sync-test').addEventListener('click', () => this.test());
    $('#sync-pull').addEventListener('click', () => this.pull({ silent: false }));
    $('#sync-push').addEventListener('click', () => this.push({ silent: false }));
    $('#sync-clear').addEventListener('click', () => {
      if (!confirm('清除 GitHub PAT 與 Gist ID？同步會停止；本機資料不動。')) return;
      localStorage.removeItem('cc_gh_pat');
      localStorage.removeItem('cc_gist_id');
      localStorage.removeItem('cc_gist_last_sync');
      patInput.value = '';
      this._renderStatus();
      showToast('已清除 PAT', 'warn');
    });
  },

  async test() {
    const pat = lsGet('cc_gh_pat');
    if (!pat) { this._setStatus('請先填 PAT', 'error'); return; }
    this._setStatus('⏳ 測試中…');
    try {
      const r = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json' },
      });
      if (!r.ok) throw new Error((await r.json()).message || `HTTP ${r.status}`);
      const u = await r.json();
      this._setStatus(`✓ 連線 OK：${u.login}`, 'success');
      showToast(`GitHub PAT 有效（${u.login}）`, 'success');
    } catch (e) {
      this._setStatus(`✕ ${e.message}`, 'error');
    }
  },

  /** 建立或取得 Gist */
  async ensureGist() {
    let id = this._gistId();
    if (id) return id;
    const pat = lsGet('cc_gh_pat');
    if (!pat) throw new Error('沒有 PAT');
    const body = {
      description: 'carb-calc personal sync (private)',
      public: false,
      files: { [this.GIST_FILENAME]: { content: JSON.stringify(this._snapshot(), null, 2) } },
    };
    const r = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error((await r.json()).message || `HTTP ${r.status}`);
    const g = await r.json();
    lsSet('cc_gist_id', g.id);
    lsSet('cc_gist_last_sync', new Date().toISOString());
    this._renderStatus();
    return g.id;
  },

  _snapshot() {
    let gi_overrides = {};
    try { gi_overrides = JSON.parse(localStorage.getItem('cc_gi_overrides') || '{}'); } catch {}
    let excluded = [];
    try { excluded = JSON.parse(localStorage.getItem('cc_excluded_foods') || '[]'); } catch {}
    const settings = {
      nickname:       lsGet(LS.NICKNAME, ''),
      ic_breakfast:   lsGet(LS.IC_BREAKFAST, '1:8.0'),
      ic_lunch:       lsGet(LS.IC_LUNCH, '1:10.0'),
      ic_dinner:      lsGet(LS.IC_DINNER, '1:10.0'),
      bg_low:         lsGet(LS.BG_LOW, '70'),
      bg_high:        lsGet(LS.BG_HIGH, '180'),
      phash_th:       lsGet(LS.PHASH_TH, '8'),
      cd_cloud:       lsGet(LS.CD_CLOUD, ''),
      cd_preset:      lsGet(LS.CD_PRESET, ''),
      theme:          lsGet(LS.THEME, 'auto'),
    };
    return {
      schema_version: 1,
      updated_at: new Date().toISOString(),
      meals: Records.meals,
      excluded_foods: excluded,
      gi_overrides,
      settings,
    };
  },

  _applySnapshot(snap) {
    if (!snap || !snap.schema_version) return;
    if (Array.isArray(snap.meals)) {
      Records.meals = snap.meals;
      Records.save();
      Records.renderList();
      Records.updateFreqMealsCount();
    }
    if (Array.isArray(snap.excluded_foods)) {
      localStorage.setItem('cc_excluded_foods', JSON.stringify(snap.excluded_foods));
      if (Exclusion?.set) {
        Exclusion.set = new Set(snap.excluded_foods);
        Exclusion._updateCount();
        if (Calc?.db) Calc.renderChips();
      }
    }
    if (snap.gi_overrides) {
      localStorage.setItem('cc_gi_overrides', JSON.stringify(snap.gi_overrides));
      if (Calc) Calc.giOverrides = snap.gi_overrides;
    }
    if (snap.settings) {
      const s = snap.settings;
      if (s.nickname != null)     lsSet(LS.NICKNAME, s.nickname);
      if (s.ic_breakfast)         lsSet(LS.IC_BREAKFAST, s.ic_breakfast);
      if (s.ic_lunch)             lsSet(LS.IC_LUNCH, s.ic_lunch);
      if (s.ic_dinner)            lsSet(LS.IC_DINNER, s.ic_dinner);
      if (s.bg_low)               lsSet(LS.BG_LOW, s.bg_low);
      if (s.bg_high)              lsSet(LS.BG_HIGH, s.bg_high);
      if (s.phash_th)             lsSet(LS.PHASH_TH, s.phash_th);
      if (s.cd_cloud)             lsSet(LS.CD_CLOUD, s.cd_cloud);
      if (s.cd_preset)            lsSet(LS.CD_PRESET, s.cd_preset);
      if (s.theme)                lsSet(LS.THEME, s.theme);
    }
  },

  /** push：debounce 2s */
  schedulePush() {
    if (!this._hasPAT()) return;
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => this.push({ silent: true }), 2000);
  },

  async push({ silent = true } = {}) {
    if (!this._hasPAT()) {
      if (!silent) showToast('未設定 PAT', 'warn');
      return;
    }
    if (this.syncing) return;
    this.syncing = true;
    try {
      this._setStatus('⏳ 上傳中…');
      const id = await this.ensureGist();
      const pat = lsGet('cc_gh_pat');
      const body = {
        files: { [this.GIST_FILENAME]: { content: JSON.stringify(this._snapshot(), null, 2) } },
      };
      const r = await fetch(`https://api.github.com/gists/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).message || `HTTP ${r.status}`);
      lsSet('cc_gist_last_sync', new Date().toISOString());
      this._renderStatus();
      this._setStatus('✓ 已同步', 'success');
      if (!silent) showToast('Gist 同步完成', 'success');
    } catch (e) {
      console.error('push failed', e);
      this._setStatus('✕ ' + e.message, 'error');
      if (!silent) showToast('同步失敗：' + e.message, 'error');
    } finally {
      this.syncing = false;
    }
  },

  async pull({ silent = true } = {}) {
    if (!this._hasPAT()) {
      if (!silent) showToast('未設定 PAT', 'warn');
      return;
    }
    const id = this._gistId();
    if (!id) {
      if (!silent) showToast('尚未建立 Gist（按推送會自動建）', 'warn');
      return;
    }
    if (this.syncing) return;
    this.syncing = true;
    try {
      this._setStatus('⏳ 下載中…');
      const pat = lsGet('cc_gh_pat');
      const r = await fetch(`https://api.github.com/gists/${id}`, {
        headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json' },
      });
      if (!r.ok) throw new Error((await r.json()).message || `HTTP ${r.status}`);
      const g = await r.json();
      const file = g.files?.[this.GIST_FILENAME];
      if (!file) throw new Error('Gist 沒有 ' + this.GIST_FILENAME);
      const content = file.truncated
        ? await (await fetch(file.raw_url)).text()
        : file.content;
      const snap = JSON.parse(content);

      // 衝突解決：若雲端 updated_at < 本機最新 meal updated_at，本機勝（不蓋）
      const localLatest = Records.meals.reduce((max, m) =>
        Math.max(max, new Date(m.updated_at || m.created_at || 0).getTime()), 0);
      const remoteTs = new Date(snap.updated_at || 0).getTime();

      if (localLatest > remoteTs && Records.meals.length > 0) {
        this._setStatus('本機較新，未覆蓋', 'warn');
        if (!silent) showToast('本機較新，已跳過下載', 'warn');
        return;
      }

      this._applySnapshot(snap);
      lsSet('cc_gist_last_sync', new Date().toISOString());
      this._renderStatus();
      this._setStatus('✓ 已下載', 'success');
      if (!silent) showToast('已從 Gist 下載', 'success');
    } catch (e) {
      console.error('pull failed', e);
      this._setStatus('✕ ' + e.message, 'error');
      if (!silent) showToast('下載失敗：' + e.message, 'error');
    } finally {
      this.syncing = false;
    }
  },
};

/* =============================================================
   Trends — 趨勢圖（Phase 5）
   ============================================================= */
const Trends = {
  charts: {},      // { ic, scatter, meal }
  state: { days: 7, mealName: null },

  init() {
    document.querySelectorAll('.trends-toolbar .period-btn').forEach(b => {
      b.addEventListener('click', () => {
        this.state.days = parseInt(b.dataset.days);
        document.querySelectorAll('.trends-toolbar .period-btn').forEach(x =>
          x.classList.toggle('active', x === b));
        this.render();
      });
    });
    $('#trend-meal-selector').addEventListener('change', e => {
      this.state.mealName = e.target.value;
      this.renderMealHistory();
    });

    // 切到 trends tab 時 render
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.addEventListener('click', () => {
        if (b.dataset.tab === 'tab-trends') {
          // 等 panel 顯示完再畫，避免 canvas 寬 0
          setTimeout(() => this.render(), 60);
        }
      });
    });
  },

  render() {
    if (typeof Chart === 'undefined') return;
    this.renderIcLine();
    this.renderScatter();
    this.populateMealSelector();
    this.renderMealHistory();
  },

  /* 圖 1: I:C 折線 */
  renderIcLine() {
    const days = this.state.days;
    const data = Records.trendData(days)
      .filter(m => m.ic_ratio)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const summary = $('#chart-ic-summary');
    if (!data.length) {
      this._destroy('ic');
      this._emptyCanvas('chart-ic', '沒有紀錄');
      summary.textContent = '';
      return;
    }

    // 用統一日期 labels (categorical)，每筆紀錄一個 x
    const xLabels = data.map(m => (m.date || '').slice(5, 16).replace('T', ' '));
    const series = { breakfast: [], lunch: [], dinner: [], late: [] };
    data.forEach((m, i) => {
      ['breakfast', 'lunch', 'dinner', 'late'].forEach(k => {
        series[k].push(m.meal === k ? m.ic_ratio : null);
      });
    });

    const colors = {
      breakfast: '#FFC107',
      lunch:     '#FB8C00',
      dinner:    '#E53935',
      late:      '#7A5C3F',
    };
    const labels = { breakfast: '🌅 早', lunch: '🌞 午', dinner: '🌙 晚', late: '🌃 宵' };

    this._destroy('ic');
    const ctx = $('#chart-ic').getContext('2d');
    this.charts.ic = new Chart(ctx, {
      type: 'line',
      data: {
        labels: xLabels,
        datasets: Object.keys(series)
          .filter(k => series[k].some(v => v != null))
          .map(k => ({
            label: labels[k],
            data: series[k],
            borderColor: colors[k],
            backgroundColor: colors[k] + '33',
            tension: 0.2,
            pointRadius: 4,
            pointHoverRadius: 6,
            spanGaps: true,
          })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#7A5C3F', maxRotation: 30, font: { size: 9 } } },
          y: { title: { display: true, text: 'I:C' }, ticks: { color: '#7A5C3F' } },
        },
        plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: 1:${(c.parsed.y ?? 0).toFixed(1)}` } } },
      },
    });
    // 計算每餐別歷史平均
    const seriesByMeal = { breakfast: [], lunch: [], dinner: [], late: [] };
    data.forEach(m => seriesByMeal[m.meal]?.push(m.ic_ratio));

    // 摘要：各餐別平均
    const lines = Object.keys(seriesByMeal)
      .filter(k => seriesByMeal[k].length)
      .map(k => {
        const arr = seriesByMeal[k];
        const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
        return `${labels[k]} 1:${avg.toFixed(1)}（${arr.length}）`;
      });
    summary.textContent = lines.join('  ·  ');
  },

  /* 圖 2: 碳水 vs 2h BG 散佈 */
  renderScatter() {
    const days = this.state.days;
    const data = Records.trendData(days).filter(m => m.bg_2h && m.total_carb);
    const summary = $('#chart-scatter-summary');
    if (!data.length) {
      this._destroy('scatter');
      this._emptyCanvas('chart-scatter', '沒有 BG 紀錄');
      summary.textContent = '';
      return;
    }
    const colors = { breakfast: '#FFC107', lunch: '#FB8C00', dinner: '#E53935', late: '#7A5C3F' };
    const labels = { breakfast: '🌅 早', lunch: '🌞 午', dinner: '🌙 晚', late: '🌃 宵' };

    const datasets = ['breakfast', 'lunch', 'dinner', 'late'].map(meal => ({
      label: labels[meal],
      data: data.filter(m => m.meal === meal).map(m => ({ x: m.total_carb, y: m.bg_2h, name: m.name })),
      backgroundColor: colors[meal],
      pointRadius: 5, pointHoverRadius: 7,
    })).filter(d => d.data.length);

    this._destroy('scatter');
    const ctx = $('#chart-scatter').getContext('2d');
    this.charts.scatter = new Chart(ctx, {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: '碳水 (g)' }, ticks: { color: '#7A5C3F' } },
          y: {
            title: { display: true, text: '餐後 2h BG (mg/dL)' }, ticks: { color: '#7A5C3F' },
            suggestedMin: 60, suggestedMax: Math.max(250, ...data.map(m => m.bg_2h)) + 20,
          },
        },
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 } } },
          tooltip: { callbacks: { label: c => `${c.raw.name}: ${c.raw.x.toFixed(0)}g → ${c.raw.y} mg/dL` } },
          // 加範圍線（在繪圖完成後）
        },
      },
      plugins: [{
        id: 'rangeBands',
        beforeDraw(chart) {
          const { ctx, chartArea, scales } = chart;
          if (!chartArea) return;
          const yLow = scales.y.getPixelForValue(70);
          const yHigh = scales.y.getPixelForValue(180);
          ctx.save();
          ctx.fillStyle = 'rgba(67, 160, 71, 0.06)';
          ctx.fillRect(chartArea.left, yHigh, chartArea.right - chartArea.left, yLow - yHigh);
          ctx.strokeStyle = 'rgba(67, 160, 71, 0.4)';
          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(chartArea.left, yLow); ctx.lineTo(chartArea.right, yLow); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(chartArea.left, yHigh); ctx.lineTo(chartArea.right, yHigh); ctx.stroke();
          ctx.restore();
        },
      }],
    });

    // 摘要：在範圍內比例
    const inRange = data.filter(m => m.bg_2h >= 70 && m.bg_2h <= 180).length;
    const pct = Math.round(inRange / data.length * 100);
    summary.innerHTML = `範圍內 (70–180)：<strong>${pct}%</strong>（${inRange}/${data.length}）`;
  },

  /* 圖 3: 單道菜歷史 */
  populateMealSelector() {
    const sel = $('#trend-meal-selector');
    const grouped = {};
    Records.meals.forEach(m => {
      grouped[m.name] = (grouped[m.name] || 0) + 1;
    });
    const sorted = Object.keys(grouped).sort((a, b) => grouped[b] - grouped[a]);
    if (!sorted.length) {
      sel.innerHTML = '<option value="">（沒有紀錄）</option>';
      this.state.mealName = null;
      return;
    }
    if (!this.state.mealName || !grouped[this.state.mealName]) {
      this.state.mealName = sorted[0];
    }
    sel.innerHTML = sorted.map(n =>
      `<option value="${escapeHtml(n)}" ${n === this.state.mealName ? 'selected' : ''}>${escapeHtml(n)}（${grouped[n]} 筆）</option>`
    ).join('');
  },

  renderMealHistory() {
    const summary = $('#chart-meal-summary');
    if (!this.state.mealName) {
      this._destroy('meal');
      this._emptyCanvas('chart-meal', '沒有紀錄');
      summary.textContent = '';
      return;
    }
    const history = Records.meals
      .filter(m => m.name === this.state.mealName)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    if (!history.length) {
      this._destroy('meal');
      this._emptyCanvas('chart-meal', '沒有紀錄');
      summary.textContent = '';
      return;
    }
    const labels = history.map(m => (m.date || '').slice(5, 16).replace('T', ' '));

    this._destroy('meal');
    const ctx = $('#chart-meal').getContext('2d');
    this.charts.meal = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '劑量 (U)', data: history.map(m => m.insulin_u),
            borderColor: '#FFC107', backgroundColor: '#FFC10733',
            yAxisID: 'y1', tension: 0.2, pointRadius: 5,
          },
          {
            label: '餐後 2h BG', data: history.map(m => m.bg_2h ?? null),
            borderColor: '#E53935', backgroundColor: '#E5393533',
            yAxisID: 'y2', tension: 0.2, pointRadius: 5, spanGaps: true,
          },
          {
            label: '餐後 1h BG', data: history.map(m => m.bg_1h ?? null),
            borderColor: '#FB8C00', backgroundColor: '#FB8C0033',
            yAxisID: 'y2', tension: 0.2, pointRadius: 4, spanGaps: true,
            borderDash: [4, 4],
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#7A5C3F', font: { size: 9 }, maxRotation: 30 } },
          y1: { type: 'linear', position: 'left', title: { display: true, text: 'U' }, ticks: { color: '#7A5C3F' } },
          y2: { type: 'linear', position: 'right', title: { display: true, text: 'BG' }, ticks: { color: '#7A5C3F' }, grid: { drawOnChartArea: false } },
        },
        plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
      },
    });

    // 摘要：呼叫演算法
    const s = Records.suggestDoseAdjust(this.state.mealName);
    if (s.kind === 'suggest') {
      const dirIcon = s.direction === 'increase' ? '↑' : s.direction === 'decrease' ? '↓' : '→';
      summary.innerHTML = `平均 1:${s.avgIc?.toFixed(1) ?? '—'} · 平均餐後峰值 ${s.avgPeak} mg/dL · 建議下次 ${s.suggestedDose.toFixed(1)}U ${dirIcon}（${s.confidence === 'high' ? '高信心' : s.confidence === 'medium' ? '中信心' : '低信心'}）`;
    } else {
      summary.textContent = `${history.length} 筆紀錄${s.reason==='no-bg' ? '（沒 BG）' : '，需 ≥3 筆才能給建議'}`;
    }
  },

  _destroy(key) {
    if (this.charts[key]) {
      try { this.charts[key].destroy(); } catch {}
      delete this.charts[key];
    }
  },

  _emptyCanvas(canvasId, msg) {
    const c = document.getElementById(canvasId);
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#999';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(msg, c.width / 2, c.height / 2);
  },
};
