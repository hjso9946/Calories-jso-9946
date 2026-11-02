/* shared helpers — multi-user + proportional kcal */
const WD = ['周日','周一','周二','周三','周四','周五','周六'];
const LS_USERS = 'calorie_users_v2';
const LS_FOOD = 'calorie_fooddb_v1';
const LS_OLD = 'calorie_app_v1';
const LS_SYNC = 'calorie_sync_v1';
const SYNC_DEFAULT = {
  owner: 'hjso9946',
  repo: 'Calories-jso-9946',
  path: 'sync.json',
  token: '',
  enabled: false
};

function $(s, el) { return (el || document).querySelector(s); }
function $all(s, el) { return Array.from((el || document).querySelectorAll(s)); }

function toast(m) {
  let t = $('#toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 1800);
}

function weekdayOf(ds) {
  try { return WD[new Date(ds + 'T12:00:00').getDay()]; } catch (e) { return ''; }
}
function fmtDate(ds) { return (ds || '') + ' ' + weekdayOf(ds); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function shiftDate(ds, n) {
  const d = new Date(ds + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function mondayOf(ds) {
  const d = new Date(ds + 'T12:00:00');
  const w = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - w);
  return d.toISOString().slice(0, 10);
}
function statusLevel(diff) { return diff <= 0 ? 'ok' : (diff <= 100 ? 'warn' : 'bad'); }
function statusMark(diff) { return diff <= 0 ? '✅' : (diff <= 100 ? '⚠️' : '🔴'); }

function renderNav(active) {
  const host = $('#navHost');
  if (!host) return;
  host.innerHTML = '';
  const nav = document.createElement('div');
  nav.className = 'nav';
  [['index.html', '卡路里'], ['weight.html', '体重'], ['spin.html', '转盘']].forEach(([href, label]) => {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = label;
    if (href === active) a.className = 'on';
    nav.appendChild(a);
  });
  host.appendChild(nav);
}

/* ---------- multi-user store ---------- */
function defaultUser(name) {
  return {
    id: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: name || '我',
    target: 1000,
    entries: [],
    weights: [],
    spin: ['猪脚饭', '麦当劳双吉', '麻辣烫', '自选菜', '鸡胸肉沙拉', '寿司', '火鸡面', '黄焖鸡']
  };
}

function loadUsers() {
  try {
    let raw = JSON.parse(localStorage.getItem(LS_USERS) || 'null');
    if (raw && Array.isArray(raw.users) && raw.users.length) {
      raw.users.forEach(u => {
        if (!Array.isArray(u.entries)) u.entries = [];
        if (!Array.isArray(u.weights)) u.weights = [];
        if (!Array.isArray(u.spin) || !u.spin.length) u.spin = defaultUser().spin;
        if (!u.target) u.target = 1000;
      });
      return raw;
    }
  } catch (e) {}

  // migrate v1
  try {
    const old = JSON.parse(localStorage.getItem(LS_OLD) || 'null');
    if (old) {
      const u = defaultUser('我');
      u.target = old.target || 1000;
      u.entries = old.entries || [];
      u.weights = old.weights || [];
      if (old.spin && old.spin.length) u.spin = old.spin;
      if (old.foods && old.foods.length) saveFooddb(old.foods);
      const wrap = { activeId: u.id, users: [u] };
      localStorage.setItem(LS_USERS, JSON.stringify(wrap));
      return wrap;
    }
  } catch (e) {}

  const u = defaultUser('我');
  const wrap = { activeId: u.id, users: [u] };
  localStorage.setItem(LS_USERS, JSON.stringify(wrap));
  return wrap;
}

function saveUsers(wrap) {
  localStorage.setItem(LS_USERS, JSON.stringify(wrap));
  if (typeof schedulePush === 'function') schedulePush();
}

function activeUser() {
  const w = loadUsers();
  let u = w.users.find(x => x.id === w.activeId) || w.users[0];
  w.activeId = u.id;
  return u;
}

function setActiveUser(id) {
  const w = loadUsers();
  if (w.users.some(x => x.id === id)) {
    w.activeId = id;
    saveUsers(w);
  }
}

function createUser(name) {
  const w = loadUsers();
  const u = defaultUser(name || ('用户' + (w.users.length + 1)));
  w.users.push(u);
  w.activeId = u.id;
  saveUsers(w);
  return u;
}

function renameUser(id, name) {
  const w = loadUsers();
  const u = w.users.find(x => x.id === id);
  if (u) {
    u.name = String(name || '').trim() || u.name;
    saveUsers(w);
  }
}

function deleteUser(id) {
  const w = loadUsers();
  if (w.users.length <= 1) return false;
  w.users = w.users.filter(x => x.id !== id);
  if (w.activeId === id) w.activeId = w.users[0].id;
  saveUsers(w);
  return true;
}

function saveActiveUser(u) {
  const w = loadUsers();
  const i = w.users.findIndex(x => x.id === u.id);
  if (i >= 0) w.users[i] = u;
  else w.users.push(u);
  w.activeId = u.id;
  saveUsers(w);
}

function renderUserBar(onSwitch) {
  const host = $('#userBar');
  if (!host) return;
  const w = loadUsers();
  const cur = activeUser();
  host.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'userbar';

  const sel = document.createElement('select');
  sel.id = 'userSel';
  sel.className = 'user-sel';
  w.users.forEach(u => {
    const o = document.createElement('option');
    o.value = u.id;
    const n = (u.entries || []).length;
    o.textContent = u.name + (n ? ' · ' + n + '条' : '');
    if (u.id === cur.id) o.selected = true;
    sel.appendChild(o);
  });
  sel.onchange = () => {
    setActiveUser(sel.value);
    toast('已切换到 ' + activeUser().name);
    if (onSwitch) onSwitch();
  };

  const edit = document.createElement('button');
  edit.className = 'user-btn';
  edit.textContent = '改名';
  edit.onclick = () => {
    const name = prompt('昵称', activeUser().name);
    if (name && name.trim()) {
      renameUser(activeUser().id, name.trim());
      renderUserBar(onSwitch);
      if (onSwitch) onSwitch();
      toast('已改名');
    }
  };

  const add = document.createElement('button');
  add.className = 'user-btn';
  add.textContent = '+用户';
  add.onclick = () => {
    const name = prompt('新用户昵称', '');
    if (name && name.trim()) {
      createUser(name.trim());
      renderUserBar(onSwitch);
      if (onSwitch) onSwitch();
      toast('已创建 ' + name.trim());
    }
  };

  const del = document.createElement('button');
  del.className = 'user-btn danger';
  del.textContent = '删';
  del.onclick = () => {
    if (loadUsers().users.length <= 1) { toast('至少留 1 个用户'); return; }
    if (!confirm('删除用户「' + activeUser().name + '」及其全部记录？')) return;
    deleteUser(activeUser().id);
    renderUserBar(onSwitch);
    if (onSwitch) onSwitch();
    toast('已删除');
  };

  const label = document.createElement('span');
  label.className = 'user-label';
  label.textContent = '当前：' + cur.name;

  const syncLine = document.createElement('div');
  syncLine.id = 'syncLine';
  syncLine.className = 'chart-note';
  syncLine.style.width = '100%';
  const paintSync = () => {
    const cfg = loadSyncCfg();
    const state = getSyncState();
    if (!cfg.enabled) {
      syncLine.textContent = '☁ 未开启云同步 · 设置里可开启';
      syncLine.style.color = '#8b9bb0';
    } else if (state && state.state === 'ok') {
      syncLine.textContent = '☁ 已同步 · ' + (state.msg || '');
      syncLine.style.color = '#3dd68c';
    } else if (state && state.state === 'err') {
      syncLine.textContent = '☁ 同步失败 · ' + (state.msg || '');
      syncLine.style.color = '#f07178';
    } else {
      syncLine.textContent = '☁ 同步中…';
      syncLine.style.color = '#f5a524';
    }
  };
  paintSync();
  window.addEventListener('calorie-sync-state', paintSync);

  box.appendChild(label);
  box.appendChild(sel);
  box.appendChild(edit);
  box.appendChild(add);
  box.appendChild(del);
  box.appendChild(syncLine);
  host.appendChild(box);
}

/* ---------- fooddb (shared) ---------- */
function loadFooddb() {
  try {
    const a = JSON.parse(localStorage.getItem(LS_FOOD) || '[]');
    return Array.isArray(a) ? a : [];
  } catch (e) { return []; }
}
function saveFooddb(list) {
  localStorage.setItem(LS_FOOD, JSON.stringify(list));
  if (typeof schedulePush === 'function') schedulePush();
}

function upsertFood(food, amount, kcal) {
  const name = String(food || '').trim();
  if (!name) return;
  const list = loadFooddb();
  const i = list.findIndex(x => x.name === name && (x.amount || '') === (amount || ''));
  if (i >= 0) {
    list[i].kcal = +kcal || list[i].kcal;
    list[i].count = (list[i].count || 1) + 1;
  } else {
    list.push({ name: name, amount: amount || '', kcal: +kcal || 0, count: 1 });
  }
  list.sort((a, b) => (b.count || 0) - (a.count || 0));
  saveFooddb(list);
}

function searchFood(q) {
  const key = String(q || '').trim().toLowerCase();
  const list = loadFooddb();
  if (!key) return list.slice(0, 12);
  return list.filter(x =>
    x.name.toLowerCase().indexOf(key) >= 0 ||
    (x.amount || '').toLowerCase().indexOf(key) >= 0
  ).slice(0, 12);
}

/* ---------- proportional kcal ---------- */
function parseAmount(s) {
  const str = String(s || '').trim();
  if (!str) return { n: 1, unit: '' };
  const m = str.match(/^([0-9]+(?:\.[0-9]+)?)\s*(g|克|kg|ml|毫升|l|个|颗|片|份|杯|碗|包|盒|块|根|只|勺|大勺|小勺)?$/i);
  if (m) {
    let n = parseFloat(m[1]);
    let unit = (m[2] || '').toLowerCase();
    if (unit === '克') unit = 'g';
    if (unit === 'kg') { n = n * 1000; unit = 'g'; }
    if (unit === '毫升') unit = 'ml';
    if (unit === 'l') { n = n * 1000; unit = 'ml'; }
    return { n: n, unit: unit };
  }
  return { n: 1, unit: str };
}

function scaleKcal(baseAmount, baseKcal, userAmount) {
  const b = parseAmount(baseAmount);
  const u = parseAmount(userAmount);
  if (!b.n || !baseKcal) return null;
  // same unit family
  const bU = b.unit, uU = u.unit;
  const same = (bU === uU) ||
    ((bU === 'g' || bU === 'ml') && (uU === 'g' || uU === 'ml')) ||
    (!bU && !uU);
  if (!same && bU && uU) return null;
  const ratio = u.n / b.n;
  if (!isFinite(ratio) || ratio <= 0) return null;
  return Math.round(baseKcal * ratio);
}

function autoKcalFor(foodName, amount) {
  const list = loadFooddb();
  const exact = list.find(x => x.name === foodName && (x.amount || '') === (amount || ''));
  if (exact) return exact.kcal;
  const byName = list.find(x => x.name === foodName);
  if (!byName) return null;
  return scaleKcal(byName.amount, byName.kcal, amount);
}

/* ---------- cloud sync (GitHub repo sync.json) ---------- */
function loadSyncCfg() {
  try {
    const c = JSON.parse(localStorage.getItem(LS_SYNC) || 'null');
    return Object.assign({}, SYNC_DEFAULT, c || {});
  } catch (e) {
    return Object.assign({}, SYNC_DEFAULT);
  }
}
function saveSyncCfg(cfg) {
  localStorage.setItem(LS_SYNC, JSON.stringify(cfg));
}

function b64utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin);
}
function unb64utf8(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function collectCloudDoc() {
  return {
    v: 2,
    updated: new Date().toISOString(),
    users: loadUsers().users,
    foods: loadFooddb()
  };
}

/* 合并规则：先按 id，同名不同 id 也并成一个（家庭多端常见） */
function mergeUsers(localUsers, remoteUsers) {
  const list = [];
  const byKey = {};
  const keyOf = (u) => {
    if (!u) return null;
    const name = String(u.name || '').trim();
    return name || u.id;
  };
  const push = (u) => {
    if (!u) return;
    const key = keyOf(u);
    if (!key) return;
    if (!byKey[key]) {
      byKey[key] = {
        id: u.id || key,
        name: u.name || key,
        target: u.target || 1000,
        entries: [],
        weights: [],
        spin: Array.isArray(u.spin) && u.spin.length ? u.spin.slice() : defaultUser().spin
      };
      list.push(byKey[key]);
    }
    const t = byKey[key];
    if (u.name) t.name = u.name;
    if (u.target) t.target = u.target;
    if (Array.isArray(u.spin) && u.spin.length) t.spin = u.spin.slice();
    (u.entries || []).forEach(e => {
      if (!e || !e.id) return;
      const i = t.entries.findIndex(x => x.id === e.id);
      if (i >= 0) t.entries[i] = e;
      else t.entries.push(e);
    });
    (u.weights || []).forEach(w => {
      if (!w || !w.date) return;
      const i = t.weights.findIndex(x => x.date === w.date);
      if (i >= 0) t.weights[i] = w;
      else t.weights.push(w);
    });
  };
  (localUsers || []).forEach(push);
  (remoteUsers || []).forEach(push);
  return list;
}

function mergeFoods(localFoods, remoteFoods) {
  const map = {};
  const put = (f) => {
    if (!f || !f.name) return;
    const key = f.name + '|' + (f.amount || '');
    if (!map[key]) {
      map[key] = { name: f.name, amount: f.amount || '', kcal: +f.kcal || 0, count: +f.count || 1 };
    } else {
      map[key].kcal = +f.kcal || map[key].kcal;
      map[key].count = Math.max(map[key].count || 1, +f.count || 1);
    }
  };
  (localFoods || []).forEach(put);
  (remoteFoods || []).forEach(put);
  return Object.keys(map).map(k => map[k]).sort((a, b) => (b.count || 0) - (a.count || 0));
}

function applyCloudDoc(doc) {
  if (!doc) return false;
  const wrap = loadUsers();
  const merged = mergeUsers(wrap.users, doc.users || []);
  const activeStill = merged.some(u => u.id === wrap.activeId);
  const next = {
    activeId: activeStill ? wrap.activeId : (merged[0] && merged[0].id),
    users: merged
  };
  localStorage.setItem(LS_USERS, JSON.stringify(next));
  const foods = mergeFoods(loadFooddb(), doc.foods || []);
  localStorage.setItem(LS_FOOD, JSON.stringify(foods));
  return true;
}

async function ghApi(path, opts) {
  opts = opts || {};
  const cfg = loadSyncCfg();
  const headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (cfg.token) headers['Authorization'] = 'Bearer ' + cfg.token;
  if (opts.body) headers['Content-Type'] = 'application/json';
  return fetch('https://api.github.com' + path, {
    method: opts.method || 'GET',
    headers: headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
}

function setSyncState(state, msg) {
  localStorage.setItem('calorie_sync_state', JSON.stringify({
    state: state,
    msg: msg || '',
    at: Date.now()
  }));
  window.dispatchEvent(new CustomEvent('calorie-sync-state', { detail: { state, msg } }));
}
function getSyncState() {
  try { return JSON.parse(localStorage.getItem('calorie_sync_state') || 'null'); } catch (e) { return null; }
}

async function syncPull(showToast) {
  const cfg = loadSyncCfg();
  const rawUrl = 'https://raw.githubusercontent.com/' + cfg.owner + '/' + cfg.repo + '/main/' + cfg.path;
  // 优先 raw（不限流、免 Token 可读）；失败再退回 API
  const tryParse = async (res) => {
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('pull ' + res.status);
    return await res.json();
  };
  try {
    let doc = null;
    try {
      const res = await fetch(rawUrl + '?t=' + Date.now(), { cache: 'no-store' });
      doc = await tryParse(res);
    } catch (e) {
      const res = await ghApi('/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + cfg.path);
      if (res.status === 404) doc = null;
      else if (!res.ok) {
        const t = await res.text();
        throw new Error('pull ' + res.status + ' ' + t.slice(0, 100));
      } else {
        const meta = await res.json();
        doc = JSON.parse(unb64utf8(meta.content));
      }
    }
    if (!doc) {
      if (showToast) toast('云端还没有数据，点「立即同步」上传');
      setSyncState('empty', '云端暂无数据');
      return false;
    }
    applyCloudDoc(doc);
    setSyncState('ok', '已同步 ' + new Date().toLocaleTimeString());
    if (showToast) toast('已拉取云端数据');
    window.dispatchEvent(new CustomEvent('calorie-sync'));
    return true;
  } catch (e) {
    setSyncState('err', String(e.message || e).slice(0, 80));
    if (showToast) toast('同步失败：' + (e.message || e));
    return false;
  }
}

async function syncPush(showToast) {
  const cfg = loadSyncCfg();
  if (!cfg.token) {
    setSyncState('need', '缺 Token，无法上传');
    if (showToast) toast('请先填 GitHub Token');
    return false;
  }
  try {
    const doc = collectCloudDoc();
    const content = b64utf8(JSON.stringify(doc, null, 2));
    let sha = undefined;
    const get = await ghApi('/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + cfg.path);
    if (get.ok) {
      const meta = await get.json();
      sha = meta.sha;
    } else if (get.status !== 404) {
      const t = await get.text();
      throw new Error('push ' + get.status + ' ' + t.slice(0, 100));
    }
    const res = await ghApi('/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + cfg.path, {
      method: 'PUT',
      body: {
        message: 'sync calorie data ' + new Date().toISOString(),
        content: content,
        sha: sha
      }
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error('push ' + res.status + ' ' + t.slice(0, 100));
    }
    setSyncState('ok', '已上传 ' + new Date().toLocaleTimeString());
    if (showToast) toast('已上传云端');
    return true;
  } catch (e) {
    const m = String(e.message || e);
    setSyncState('err', m.slice(0, 80));
    if (showToast) toast('上传失败：' + m);
    return false;
  }
}

async function syncNow(showToast) {
  await syncPull(false);
  await syncPush(showToast);
}

let _syncTimer = null;
function startSyncLoop() {
  stopSyncLoop();
  const cfg = loadSyncCfg();
  if (!cfg.enabled) return;
  syncPull(false);
  _syncTimer = setInterval(() => { syncPull(false); }, 20000);
}
function stopSyncLoop() {
  if (_syncTimer) {
    clearInterval(_syncTimer);
    _syncTimer = null;
  }
}

let _pushDebounce = null;
function schedulePush() {
  const cfg = loadSyncCfg();
  if (!cfg.enabled || !cfg.token) return;
  clearTimeout(_pushDebounce);
  _pushDebounce = setTimeout(() => { syncPush(false); }, 1500);
}

function syncBadge() {
  const cfg = loadSyncCfg();
  if (!cfg.enabled) return 'off';
  return cfg.token ? 'on' : 'need';
}

/* ---------- charts ---------- */
function drawLine(canvas, series, opts) {
  opts = opts || {};
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 640;
  const cssH = opts.height || 240;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const data = series || [];
  if (!data.length) {
    ctx.fillStyle = '#8b9bb0';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(opts.empty || '暂无数据', cssW / 2, cssH / 2);
    return;
  }
  const vals = data.map(x => +x.v).filter(v => !isNaN(v));
  if (!vals.length) {
    ctx.fillStyle = '#8b9bb0';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(opts.empty || '暂无数据', cssW / 2, cssH / 2);
    return;
  }
  let minV = Math.min.apply(null, vals);
  let maxV = Math.max.apply(null, vals);
  if (opts.yMin != null) minV = Math.min(minV, opts.yMin);
  if (opts.yMax != null) maxV = Math.max(maxV, opts.yMax);
  const pad = Math.max(1, (maxV - minV) * 0.2) || 1;
  minV -= pad; maxV += pad;
  const padL = 40, padR = 12, padT = 14, padB = 30;
  const W = cssW - padL - padR, H = cssH - padT - padB;

  ctx.strokeStyle = '#2a3542';
  ctx.fillStyle = '#8b9bb0';
  ctx.font = '10px sans-serif';
  for (let i = 0; i <= 4; i++) {
    const y = padT + H * (i / 4);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + W, y); ctx.stroke();
    const v = maxV - (maxV - minV) * (i / 4);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(v * 10) / 10), padL - 6, y);
  }
  if (opts.target != null) {
    const ty = padT + H - ((opts.target - minV) / (maxV - minV)) * H;
    if (ty >= padT && ty <= padT + H) {
      ctx.strokeStyle = '#8b9bb0';
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(padL, ty); ctx.lineTo(padL + W, ty); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  const pt = (i) => {
    const x = data.length === 1 ? padL + W / 2 : padL + (W * i / (data.length - 1));
    const y = padT + H - (((+data[i].v || 0) - minV) / (maxV - minV)) * H;
    return [x, y];
  };
  if (data.length > 1) {
    ctx.strokeStyle = opts.color || '#5b9dff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    data.forEach((_, i) => {
      const p = pt(i);
      if (i === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    });
    ctx.stroke();
  }
  data.forEach((d, i) => {
    const p = pt(i);
    ctx.fillStyle = opts.color || '#5b9dff';
    ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, Math.PI * 2); ctx.fill();
    const every = Math.max(1, Math.ceil(data.length / 7));
    if (i % every === 0 || i === data.length - 1) {
      ctx.fillStyle = '#8b9bb0';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.label || '', p[0], cssH - 10);
    }
  });
}

function drawBars(canvas, series, opts) {
  opts = opts || {};
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 640;
  const cssH = opts.height || 240;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const data = series || [];
  if (!data.length) return;
  const target = opts.target || 1000;
  const maxV = Math.max(target, ...data.map(x => x.v || 0), 100) * 1.15;
  const padL = 36, padR = 8, padT = 12, padB = 28;
  const W = cssW - padL - padR, H = cssH - padT - padB;
  const n = data.length;
  const gap = 3;
  const bw = Math.max(4, (W - gap * (n - 1)) / n);

  ctx.strokeStyle = '#2a3542';
  ctx.fillStyle = '#8b9bb0';
  ctx.font = '10px sans-serif';
  for (let i = 0; i <= 4; i++) {
    const y = padT + H * (i / 4);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + W, y); ctx.stroke();
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(maxV * (1 - i / 4))), padL - 6, y);
  }
  data.forEach((x, i) => {
    const val = x.v || 0;
    const h = (val / maxV) * H;
    const bx = padL + i * (bw + gap);
    const by = padT + H - h;
    if (x.v == null) {
      ctx.fillStyle = '#2a3542';
      ctx.fillRect(bx, padT + H - 2, bw, 2);
    } else {
      const diff = x.v - target;
      ctx.fillStyle = diff <= 0 ? '#3dd68c' : (diff <= 100 ? '#f5a524' : '#f07178');
      if (h < 2) ctx.fillRect(bx, padT + H - 2, bw, 2);
      else ctx.fillRect(bx, by, bw, h);
    }
    if (n <= 14 || i % 3 === 0) {
      ctx.fillStyle = '#8b9bb0';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(x.label, bx + bw / 2, cssH - 10);
    }
  });
  const ty = padT + H - (target / maxV) * H;
  ctx.strokeStyle = '#8b9bb0';
  ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.moveTo(padL, ty); ctx.lineTo(padL + W, ty); ctx.stroke();
  ctx.setLineDash([]);
}

/* period stats for week/month */
function periodStats(entries, weights, target, start, end) {
  const days = [];
  let d = start;
  let guard = 0;
  while (d <= end && guard++ < 62) {
    const dayE = entries.filter(e => e.date === d);
    const total = dayE.reduce((s, e) => s + (+e.kcal || 0), 0);
    days.push({ date: d, total: dayE.length ? total : null, has: dayE.length > 0 });
    d = shiftDate(d, 1);
  }
  const rec = days.filter(x => x.has);
  const totalAll = rec.reduce((s, x) => s + x.total, 0);
  const avg = rec.length ? Math.round(totalAll / rec.length) : 0;
  const ok = rec.filter(x => x.total <= target).length;
  const overDays = rec.filter(x => x.total > target);
  const overSum = overDays.reduce((s, x) => s + (x.total - target), 0);
  const maxOver = overDays.reduce((m, x) => Math.max(m, x.total - target), 0);
  const fatEq = Math.round(overSum / 7700 * 100) / 100; // kg 脂肪当量

  const wIn = weights
    .filter(w => w.date >= start && w.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
  let weightLoss = null, wStart = null, wEnd = null;
  if (wIn.length) {
    wStart = wIn[0];
    wEnd = wIn[wIn.length - 1];
    if (wStart && wEnd) weightLoss = Math.round((wStart.jin - wEnd.jin) * 10) / 10;
  }
  return {
    days: days,
    total: totalAll,
    avg: avg,
    rec: rec.length,
    ok: ok,
    okRate: rec.length ? Math.round(ok / rec.length * 100) : null,
    overDays: overDays.length,
    overSum: overSum,
    maxOver: maxOver,
    fatEq: fatEq,
    weightLoss: weightLoss,
    wStart: wStart,
    wEnd: wEnd
  };
}

function compareAllUsers(start, end) {
  return loadUsers().users.map(u => {
    const st = periodStats(u.entries || [], u.weights || [], u.target || 1000, start, end);
    return { name: u.name, target: u.target, stats: st };
  });
}

/* shared CSS */
(function injectCSS() {
  const css = `
:root{--bg:#0f1419;--card:#1a222c;--text:#e7eef7;--muted:#8b9bb0;--ok:#3dd68c;--warn:#f5a524;--bad:#f07178;--line:#2a3542;--accent:#5b9dff;--accent2:#7c6cff}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--text);padding:14px 14px 40px;-webkit-tap-highlight-color:transparent}
.wrap{max-width:520px;margin:0 auto}
.nav{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px}
.nav a{display:block;text-align:center;padding:12px 8px;border-radius:12px;background:rgba(255,255,255,.05);color:var(--muted);text-decoration:none;font-size:13px;font-weight:600}
.nav a.on{background:rgba(91,157,255,.18);color:var(--accent)}
.userbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin-bottom:12px}
.user-label{font-size:12px;color:var(--muted);width:100%}
.user-sel{flex:1;min-width:120px;background:rgba(255,255,255,.06);border:1px solid var(--line);color:var(--text);border-radius:10px;padding:10px;font-size:14px}
.user-btn{border:0;background:rgba(91,157,255,.15);color:var(--accent);font-weight:600;border-radius:10px;padding:10px 12px;font-size:12px;cursor:pointer}
.user-btn.danger{background:rgba(240,113,120,.15);color:var(--bad)}
.datebar{display:flex;gap:8px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin-bottom:12px}
.datebar input{flex:1;background:rgba(255,255,255,.06);border:1px solid var(--line);color:var(--text);border-radius:10px;padding:10px;font-size:14px;outline:none;min-width:0}
.datebar button{border:0;background:rgba(91,157,255,.15);color:var(--accent);font-weight:700;border-radius:10px;padding:10px 12px;font-size:12px;cursor:pointer;white-space:nowrap}
.hero{text-align:center;padding:8px 0 14px}
.hero .date{color:var(--muted);font-size:13px}
.hero .total{font-size:48px;font-weight:700;line-height:1.1;margin:6px 0}
.hero .total span{font-size:15px;color:var(--muted);font-weight:500}
.badge{display:inline-block;padding:6px 14px;border-radius:999px;font-size:13px;font-weight:600}
.badge.ok{background:rgba(61,214,140,.15);color:var(--ok)}
.badge.warn{background:rgba(245,165,36,.15);color:var(--warn)}
.badge.bad{background:rgba(240,113,120,.15);color:var(--bad)}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:14px}
.card h2{font-size:12px;color:var(--muted);font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin-bottom:12px}
.grid{display:grid;gap:10px}
.g3{grid-template-columns:1fr 1fr 1fr}
.g2{grid-template-columns:1fr 1fr}
.stat{background:rgba(255,255,255,.04);border-radius:12px;padding:12px 8px;text-align:center}
.stat .v{font-size:20px;font-weight:700}
.stat .k{font-size:11px;color:var(--muted);margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:13px}
td,th{padding:9px 4px;text-align:left}
td.num{text-align:right;font-variant-numeric:tabular-nums}
th{color:var(--muted);font-weight:500;font-size:11px;border-bottom:1px solid var(--line)}
tr+tr td{border-top:1px solid var(--line)}
tr.ok td{color:var(--ok)} tr.bad td{color:var(--bad)}
.empty{color:var(--muted);text-align:center;padding:20px 0 !important}
.btn{border:0;border-radius:12px;padding:13px 14px;font-size:15px;font-weight:600;cursor:pointer;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;width:100%}
.btn:active{opacity:.85}
.btn.ghost{background:rgba(255,255,255,.06);color:var(--text)}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{background:rgba(91,157,255,.12);color:var(--accent);border:1px solid rgba(91,157,255,.25);border-radius:999px;padding:8px 11px;font-size:12px;cursor:pointer;user-select:none}
.chip:active{transform:scale(.97)}
input[type=text],input[type=number],input[type=date],input[type=month],select{width:100%;background:rgba(255,255,255,.06);border:1px solid var(--line);color:var(--text);border-radius:12px;padding:12px;font-size:16px;outline:none}
input:focus,select:focus{border-color:var(--accent)}
label{display:block;font-size:11px;color:var(--muted);margin:0 0 6px}
.field{margin-bottom:12px}
.seg{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;background:rgba(255,255,255,.04);padding:4px;border-radius:12px}
.seg button{border:0;background:transparent;color:var(--muted);padding:10px 4px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer}
.seg button.on{background:rgba(91,157,255,.2);color:var(--accent)}
.tabs{display:grid;grid-template-columns:repeat(6,1fr);gap:5px;margin-bottom:14px}
.tabs button{border:0;background:rgba(255,255,255,.05);color:var(--muted);padding:11px 2px;border-radius:11px;font-size:11px;font-weight:600;cursor:pointer}
.tabs button.on{background:rgba(91,157,255,.18);color:var(--accent)}
.toast{position:fixed;left:50%;top:16px;transform:translateX(-50%) translateY(-80px);background:#222c38;color:#fff;padding:12px 18px;border-radius:12px;font-size:14px;transition:transform .25s;z-index:99;box-shadow:0 8px 24px rgba(0,0,0,.35);max-width:90vw}
.toast.show{transform:translateX(-50%) translateY(0)}
.del{color:var(--bad);background:none;border:0;font-size:18px;cursor:pointer;padding:4px 8px}
.foot{text-align:center;color:var(--muted);font-size:11px;margin-top:18px;opacity:.75;line-height:1.7}
.kcal-input{display:flex;gap:8px}
.kcal-input input{flex:1}
.plus{width:42px;height:42px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.05);color:var(--text);font-size:22px;cursor:pointer;flex-shrink:0}
canvas{width:100%;height:230px;display:block}
.legend{display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--muted);margin-top:8px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:4px;vertical-align:-1px}
.chart-note{font-size:11px;color:var(--muted);margin-top:8px;line-height:1.6}
.autocomplete{position:relative}
.ac-list{position:absolute;left:0;right:0;top:100%;z-index:20;background:#222c38;border:1px solid var(--line);border-radius:12px;margin-top:4px;max-height:220px;overflow:auto;display:none}
.ac-list.open{display:block}
.ac-item{padding:11px 12px;cursor:pointer;display:flex;justify-content:space-between;gap:8px;font-size:13px}
.ac-item:hover,.ac-item:active{background:rgba(91,157,255,.15)}
.ac-item .m{color:var(--muted);font-size:11px}
.cmp-btn{width:100%;margin:10px 0}
`;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
})();
