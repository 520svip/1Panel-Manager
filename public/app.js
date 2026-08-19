const { createApp, reactive, computed, watch, onMounted, onUnmounted, ref } = Vue;

// ==================== 工具函数 ====================
function parseTs(s) {
  if (s == null) return null;
  if (typeof s === 'number') return new Date(s);
  let str = String(s);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) str = str.replace(' ', 'T');
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

const fmt = {
  bytes(v) {
    if (v == null || isNaN(v)) return '-';
    v = Number(v);
    const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let i = 0;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return (i === 0 ? v.toFixed(0) : v.toFixed(1)) + ' ' + u[i];
  },
  pct(v) { return (v == null || isNaN(v)) ? '-' : Number(v).toFixed(1) + '%'; },
  num(v) { return (v == null || isNaN(v)) ? '-' : Number(v).toFixed(1); },
  time(ts) {
    const d = parseTs(ts);
    if (!d) return '-';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  },
  clock(ts) {
    const d = parseTs(ts);
    if (!d) return '-';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  },
  uptime(rt) {
    if (!rt) return '-';
    if (typeof rt === 'object') {
      const parts = [];
      if (rt.days) parts.push(rt.days + '天');
      if (rt.hours) parts.push(rt.hours + '时');
      if (rt.minutes) parts.push(rt.minutes + '分');
      return parts.join(' ') || '-';
    }
    const sec = Number(rt) || 0;
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
    return d > 0 ? `${d}天 ${h}时` : (h > 0 ? `${h}时 ${m}分` : `${m}分`);
  },
  maskKey(k) {
    if (!k) return '-';
    if (k.length <= 8) return '****';
    return k.slice(0, 4) + '****' + k.slice(-4);
  },
};

function colorFor(p) {
  if (p == null) return '#94a3b8';
  if (p >= 90) return '#ef4444';
  if (p >= 70) return '#f59e0b';
  return '#22c55e';
}

// 并发限流：最多同时执行 limit 个任务，避免大量机器同时刷新造成连接风暴
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

const REFRESH_CONCURRENCY = 5; // 同时刷新最多 5 台

// ==================== 全局状态 ====================
const state = reactive({
  loggedIn: !!localStorage.getItem('pm_token'),
  view: 'list', // list | monitor
  monitorId: null,
  panels: [],
  loadingPanels: false,
  toast: null,
  showPanelForm: false,
  editingPanel: null, // null=新增，否则为编辑对象
  showSettings: false,
  monitor: {
    loading: false,
    data: null,
    autoRefresh: true,
    interval: 3,
    lastUpdate: null,
    activeTab: 'home', // home | apps
    stats: null,
    apps: [],
    appsLoading: false,
    appOps: {},
    appSearch: '',
    upgradeApp: null,
    upgradeVersions: [],
    upgradeIndex: 0,
    upgradeLoading: false,
  },
  list: {
    autoRefresh: true,
    interval: 5,
  },
  search: '',
  activeCategory: 'all',
  activeVersion: 'all',
  activeStatus: 'all',
});

let toastTimer = null;
function toast(msg, type = 'info') {
  state.toast = { msg, type };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.toast = null; }, 3200);
}

// ==================== API ====================
async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  const token = localStorage.getItem('pm_token');
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(path, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let json = {};
  try { json = await res.json(); } catch { /* ignore */ }
  if (res.status === 401) {
    localStorage.removeItem('pm_token');
    state.loggedIn = false;
    throw new Error(json.message || '未登录或会话已过期');
  }
  if (!res.ok) throw new Error(json.message || ('请求失败 (' + res.status + ')'));
  return json.data;
}

// ==================== 面板列表 ====================
async function loadPanels() {
  state.loadingPanels = true;
  try {
    state.panels = await api('/api/panels');
    await mapLimit(state.panels, REFRESH_CONCURRENCY, (p) => refreshPanel(p.id, true));
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    state.loadingPanels = false;
  }
}

async function refreshPanel(id, silent = false) {
  const p = state.panels.find((x) => x.id === id);
  if (!p) return;
  if (p._refreshing) return; // 防止并发重复请求
  p._refreshing = true;
  try {
    const data = await api(`/api/panels/${id}/refresh`, { method: 'POST' });
    p._online = data.online;
    p._error = data.error;
    p._current = data.current;
    p._base = data.base;
    if (!silent && data.online) toast(`「${p.name}」已刷新`);
  } catch (e) {
    p._online = false;
    p._error = e.message;
    if (!silent) toast(e.message, 'error');
  } finally {
    p._refreshing = false;
  }
}

let refreshingAll = false; // 防止定时器与手动刷新重叠
async function refreshAll(silent = false) {
  if (refreshingAll) return;
  refreshingAll = true;
  try {
    await mapLimit(state.panels, REFRESH_CONCURRENCY, (p) => refreshPanel(p.id, true));
    if (!silent) toast('已刷新全部面板');
  } finally {
    refreshingAll = false;
  }
}

function openPanel(p) {
  const url = `${p.protocol}://${p.host}:${p.port}${normalizeEntry(p.entry)}`;
  window.open(url, '_blank', 'noopener');
}

function normalizeEntry(entry) {
  if (!entry) return '';
  let e = String(entry).trim();
  if (e && !e.startsWith('/')) e = '/' + e;
  return e;
}

function gotoMonitor(id) {
  state.monitorId = id;
  state.view = 'monitor';
  location.hash = '#/monitor/' + id;
  state.monitor.data = null;
  state.monitor.stats = null;
  state.monitor.apps = [];
  state.monitor.activeTab = 'home';
  fetchMonitor();
}

function backToList() {
  state.view = 'list';
  location.hash = '#/';
}

async function restartPanel(p) {
  if (!confirm(`确定要重启面板「${p.name}」吗？`)) return;
  try {
    const r = await api(`/api/panels/${p.id}/restart`, { method: 'POST' });
    toast(r && r.message ? r.message : '重启指令已下发', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function rebootPanel(p) {
  if (!confirm(`确定要重启「${p.name}」所在服务器系统吗？此操作会中断服务，请谨慎！`)) return;
  try {
    const r = await api(`/api/panels/${p.id}/reboot`, { method: 'POST' });
    toast(r && r.message ? r.message : '重启系统指令已下发', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deletePanel(p) {
  if (!confirm(`确定要删除面板「${p.name}」的配置信息吗？`)) return;
  try {
    await api(`/api/panels/${p.id}`, { method: 'DELETE' });
    state.panels = state.panels.filter((x) => x.id !== p.id);
    toast('已删除', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ==================== 面板表单 ====================
const blankForm = () => ({
  name: '', protocol: 'http', host: '', port: 8888, entry: '', version: 'v2', apiKey: '', remark: '', category: '',
});
const panelForm = reactive(blankForm());

function openAddPanel() {
  Object.assign(panelForm, blankForm());
  state.editingPanel = null;
  state.showPanelForm = true;
}

function openEditPanel(p) {
  Object.assign(panelForm, {
    name: p.name, protocol: p.protocol, host: p.host, port: p.port,
    entry: p.entry, version: p.version, apiKey: p.api_key, remark: p.remark, category: p.category || '',
  });
  state.editingPanel = p;
  state.showPanelForm = true;
}

async function savePanel() {
  if (!panelForm.name || !panelForm.host) {
    toast('请填写名称和主机地址', 'error');
    return;
  }
  const body = { ...panelForm, port: Number(panelForm.port) || 8888 };
  try {
    if (state.editingPanel) {
      const updated = await api(`/api/panels/${state.editingPanel.id}`, { method: 'PUT', body });
      const idx = state.panels.findIndex((x) => x.id === updated.id);
      if (idx >= 0) state.panels.splice(idx, 1, updated);
      toast('已保存', 'success');
    } else {
      const created = await api('/api/panels', { method: 'POST', body });
      state.panels.push(created);
      toast('已添加', 'success');
    }
    state.showPanelForm = false;
    refreshPanel(state.editingPanel ? state.editingPanel.id : state.panels[state.panels.length - 1].id, true);
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ==================== 设置 ====================
const passwordForm = reactive({ oldPassword: '', newPassword: '', confirm: '' });

function openSettings() {
  passwordForm.oldPassword = '';
  passwordForm.newPassword = '';
  passwordForm.confirm = '';
  state.showSettings = true;
}

async function changePassword() {
  if (passwordForm.newPassword.length < 6) {
    toast('新密码至少 6 位', 'error');
    return;
  }
  if (passwordForm.newPassword !== passwordForm.confirm) {
    toast('两次输入的新密码不一致', 'error');
    return;
  }
  try {
    await api('/api/settings/password', {
      method: 'POST',
      body: { oldPassword: passwordForm.oldPassword, newPassword: passwordForm.newPassword },
    });
    toast('密码已修改', 'success');
    state.showSettings = false;
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ==================== 登录 ====================
const loginPassword = ref('');

async function doLogin() {
  if (!loginPassword.value) return;
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: { password: loginPassword.value } });
    localStorage.setItem('pm_token', data.token);
    state.loggedIn = true;
    loginPassword.value = '';
    // 根据当前 URL hash 恢复视图（可能直接访问 #/monitor/13）
    routeHash();
    loadPanels();
    loadUiSettings();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// 根据 URL hash 路由到对应视图
function routeHash() {
  const m = location.hash.match(/^#\/monitor\/(\d+)/);
  if (m) {
    state.monitorId = Number(m[1]);
    state.view = 'monitor';
    state.monitor.data = null;
    state.monitor.stats = null;
    state.monitor.apps = [];
    state.monitor.activeTab = 'home';
    fetchMonitor();
  } else {
    state.view = 'list';
  }
}

async function doLogout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  localStorage.removeItem('pm_token');
  state.loggedIn = false;
  state.view = 'list';
  location.hash = '#/';
}

// ==================== UI 设置持久化 ====================
async function loadUiSettings() {
  try {
    const s = await api('/api/settings/ui');
    state.list.autoRefresh = s.listAutoRefresh;
    state.list.interval = s.listInterval;
    state.monitor.autoRefresh = s.monitorAutoRefresh;
    state.monitor.interval = s.monitorInterval;
  } catch (e) {
    // 加载失败则保留默认值
  }
}

async function saveUiSettings() {
  try {
    await api('/api/settings/ui', {
      method: 'POST',
      body: {
        listAutoRefresh: state.list.autoRefresh,
        listInterval: state.list.interval,
        monitorAutoRefresh: state.monitor.autoRefresh,
        monitorInterval: state.monitor.interval,
      },
    });
  } catch (e) {
    // 静默忽略，避免打扰用户
  }
}

// ==================== 监控 ====================
function normalizeHistory(history) {
  const series = {};
  const pick = (v, keys) => {
    if (v == null) return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'object') {
      for (const k of keys) { if (typeof v[k] === 'number') return v[k]; }
    }
    return null;
  };
  for (const item of history || []) {
    const p = String(item.param || '').toLowerCase();
    const dates = item.date || [];
    const values = item.value || [];
    if (p.includes('cpu')) {
      series.cpu = { dates, values: values.map((v) => pick(v, ['cpu', 'Cpu', 'cpuUsedPercent'])) };
    } else if (p.includes('memory') || p.includes('mem')) {
      series.memory = { dates, values: values.map((v) => pick(v, ['memory', 'Memory', 'memoryUsedPercent', 'mem'])) };
    } else if (p.includes('load')) {
      series.load = { dates, values: values.map((v) => pick(v, ['load1', 'Load1', 'cpuLoad1', 'CpuLoad1'])) };
    } else if (p.includes('network')) {
      series.network = {
        dates,
        up: values.map((v) => pick(v, ['up', 'Up', 'netBytesSent', 'NetBytesSent'])),
        down: values.map((v) => pick(v, ['down', 'Down', 'netBytesRecv', 'NetBytesRecv'])),
      };
    } else if (p.includes('io')) {
      series.io = {
        dates,
        read: values.map((v) => pick(v, ['read', 'Read', 'ioReadBytes', 'IOReadBytes'])),
        write: values.map((v) => pick(v, ['write', 'Write', 'ioWriteBytes', 'IOWriteBytes'])),
      };
    } else if (p === 'base') {
      // 兼容部分版本将 CPU/内存/负载合并为 base 对象数组
      series.cpu = { dates, values: values.map((v) => pick(v, ['cpu', 'Cpu'])) };
      series.memory = { dates, values: values.map((v) => pick(v, ['memory', 'Memory'])) };
      series.load = { dates, values: values.map((v) => pick(v, ['cpuLoad1', 'CpuLoad1', 'load1', 'Load1'])) };
    }
  }
  return series;
}

async function fetchMonitor() {
  const id = state.monitorId;
  if (!id) return;
  if (state.monitor.loading) return; // 防止上一次请求未完成时重叠发起
  state.monitor.loading = true;
  try {
    const data = await api(`/api/panels/${id}/monitor`);
    data.series = normalizeHistory(data.history);
    state.monitor.data = data;
    if (data.stats) state.monitor.stats = data.stats;
    state.monitor.lastUpdate = new Date();
  } catch (e) {
    state.monitor.data = state.monitor.data || null;
    toast(e.message, 'error');
  } finally {
    state.monitor.loading = false;
  }
}

// 已安装应用列表（应用商店）
async function fetchApps() {
  const id = state.monitorId;
  if (!id) return;
  if (state.monitor.appsLoading) return;
  state.monitor.appsLoading = true;
  try {
    const token = localStorage.getItem('pm_token') || '';
    const apps = await api(`/api/panels/${id}/apps`) || [];
    // <img> 无法带 Authorization 头，把会话 token 拼到图标 URL 上
    state.monitor.apps = apps.map((a) => {
      if (a.iconUrl && token) a.iconUrl += (a.iconUrl.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token);
      return a;
    });
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    state.monitor.appsLoading = false;
  }
}

// 操作应用：start / stop / restart / uninstall
async function operateApp(app, operate) {
  const labels = { start: '启动', stop: '停止', restart: '重启', uninstall: '卸载' };
  const label = labels[operate] || operate;
  if (operate === 'uninstall') {
    if (!confirm(`确定要卸载应用「${app.name}」吗？\n该操作会移除应用及其容器，请谨慎！`)) return;
  } else if (!confirm(`确定要对「${app.name}」执行「${label}」操作吗？`)) {
    return;
  }
  const key = app.id;
  if (state.monitor.appOps[key]) return;
  state.monitor.appOps[key] = true;
  try {
    const extra = operate === 'uninstall' ? { forceDelete: true } : undefined;
    const r = await api(`/api/panels/${state.monitorId}/apps/${app.id}/op`, {
      method: 'POST',
      body: { operate, ...(extra || {}) },
    });
    toast(r && r.message ? r.message : `「${label}」操作已下发`, 'success');
    // 稍等片刻再刷新列表，让状态有时间更新
    setTimeout(fetchApps, 1500);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    state.monitor.appOps[key] = false;
  }
}

// 同步应用商店
async function syncApps() {
  try {
    const r = await api(`/api/panels/${state.monitorId}/apps/sync`, { method: 'POST' });
    toast(r && r.message ? r.message : '已触发应用商店同步', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

// 打开升级弹窗（优先使用"检查更新"时已缓存的版本列表）
async function openUpgrade(app) {
  state.monitor.upgradeApp = app;
  state.monitor.upgradeIndex = 0;
  if (app.updateVersions && app.updateVersions.length) {
    state.monitor.upgradeVersions = app.updateVersions;
    state.monitor.upgradeLoading = false;
    return;
  }
  state.monitor.upgradeVersions = [];
  state.monitor.upgradeLoading = true;
  try {
    const versions = await api(`/api/panels/${state.monitorId}/apps/${app.id}/versions`);
    state.monitor.upgradeVersions = versions || [];
  } catch (e) {
    toast(e.message, 'error');
    state.monitor.upgradeApp = null;
  } finally {
    state.monitor.upgradeLoading = false;
  }
}

// 执行升级
async function doUpgrade(app, version) {
  if (!confirm(`确定将「${app.name}」升级到 ${version.version} 吗？`)) return;
  const key = app.id;
  if (state.monitor.appOps[key]) return;
  state.monitor.appOps[key] = true;
  try {
    const r = await api(`/api/panels/${state.monitorId}/apps/${app.id}/op`, {
      method: 'POST',
      body: {
        operate: 'upgrade',
        detailId: version.detailId,
        version: version.version,
        dockerCompose: version.dockerCompose || '',
        backup: true,
        pullImage: true,
        deleteImage: true,
      },
    });
    toast(r && r.message ? r.message : '升级已下发', 'success');
    state.monitor.upgradeApp = null;
    setTimeout(fetchApps, 1500);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    state.monitor.appOps[key] = false;
  }
}

// 应用状态文案
function appStatusText(s) {
  const v = String(s || '').toLowerCase();
  if (v === 'running' || v === 'up') return '运行中';
  if (v === 'stopped' || v === 'exited' || v === 'created' || v === 'paused') return '已停止';
  return s || '未知';
}
function appStatusClass(s) {
  const v = String(s || '').toLowerCase();
  if (v === 'running' || v === 'up') return 'online';
  return 'offline';
}
// 图标加载失败（404/网络错误）时回退为文字占位
function iconError(app) {
  app.iconError = true;
}


let monitorTimer = null;
function startMonitorRefresh() {
  stopMonitorRefresh();
  if (state.monitor.autoRefresh && state.view === 'monitor') {
    monitorTimer = setInterval(() => fetchMonitor(), Math.max(1, state.monitor.interval) * 1000);
  }
}
function stopMonitorRefresh() {
  if (monitorTimer) { clearInterval(monitorTimer); monitorTimer = null; }
}

// ==================== 列表定时刷新 ====================
// 用 setTimeout 链式调度：上一轮结束后，再等 interval 秒才刷新下一轮。
// 语义为「刷新完成后间隔 N 秒」，即使一轮耗时超过间隔也不会堆积请求，
// 更不会出现 setInterval 那样的「跳拍」或实际周期不可控的问题。
let listTimer = null;
function stopListRefresh() {
  if (listTimer) { clearTimeout(listTimer); listTimer = null; }
}
function scheduleListRefresh() {
  stopListRefresh();
  if (!(state.loggedIn && state.view === 'list' && state.list.autoRefresh && state.panels.length > 0)) return;
  listTimer = setTimeout(async () => {
    listTimer = null;
    await refreshAll(true);      // 若手动刷新正在跑，refreshingAll 锁会直接跳过
    scheduleListRefresh();       // 结束后再按当前间隔排下一轮
  }, Math.max(1, state.list.interval) * 1000);
}

// ==================== 组件 ====================
const ProgressBar = {
  props: { value: Number, color: String },
  computed: {
    w() { const v = Math.max(0, Math.min(100, Number(this.value) || 0)); return v.toFixed(1) + '%'; },
  },
  template: `<div class="bar"><span :style="{ width: w, background: color || '#22c55e' }"></span></div>`,
};

const LineChart = {
  props: { values: Array, color: { type: String, default: '#3b82f6' }, height: { type: Number, default: 60 } },
  computed: {
    nums() { return (this.values || []).map((v) => (typeof v === 'number' && !isNaN(v) ? v : null)); },
    pts() {
      const v = this.nums;
      if (v.length < 2) return '';
      const valid = v.filter((x) => x != null);
      if (valid.length < 2) return '';
      const max = Math.max(...valid) || 1;
      const min = Math.min(...valid) || 0;
      const range = max - min || 1;
      const h = this.height;
      return v.map((x, i) => {
        if (x == null) return null;
        const px = (i / (v.length - 1)) * 100;
        const py = h - 4 - ((x - min) / range) * (h - 8);
        return `${px.toFixed(2)},${py.toFixed(2)}`;
      }).filter(Boolean).join(' ');
    },
    area() {
      const v = this.nums;
      if (v.length < 2) return '';
      const valid = v.filter((x) => x != null);
      if (valid.length < 2) return '';
      const max = Math.max(...valid) || 1;
      const min = Math.min(...valid) || 0;
      const range = max - min || 1;
      const h = this.height;
      const top = v.map((x, i) => {
        if (x == null) return null;
        const px = (i / (v.length - 1)) * 100;
        const py = h - 4 - ((x - min) / range) * (h - 8);
        return `${px.toFixed(2)},${py.toFixed(2)}`;
      }).filter(Boolean).join(' ');
      return `0,${h} ${top} 100,${h}`;
    },
  },
  template: `
    <svg class="line-chart" :viewBox="'0 0 100 ' + height" preserveAspectRatio="none">
      <polygon v-if="area" :points="area" :fill="color" opacity="0.08" />
      <polyline v-if="pts" :points="pts" fill="none" :stroke="color" stroke-width="1.5" vector-effect="non-scaling-stroke" />
    </svg>
  `,
};

// ==================== 根组件 ====================
const App = {
  components: { ProgressBar, LineChart },
  setup() {
    function handleHash() {
      routeHash();
    }

    onMounted(() => {
      window.addEventListener('hashchange', handleHash);
      if (state.loggedIn) {
        handleHash();
        loadPanels();
        loadUiSettings();
      }
    });
    onUnmounted(() => {
      window.removeEventListener('hashchange', handleHash);
      stopMonitorRefresh();
      stopListRefresh();
    });

    watch(() => state.view, (v) => {
      if (v === 'monitor') startMonitorRefresh();
      else stopMonitorRefresh();
      scheduleListRefresh();
    });
    watch(() => state.monitor.interval, () => startMonitorRefresh());
    watch(() => state.monitor.autoRefresh, () => startMonitorRefresh());
    watch(() => [state.loggedIn, state.panels.length, state.list.autoRefresh, state.list.interval], scheduleListRefresh);

    const monOnline = computed(() => state.monitor.data?.online === true);
    const monError = computed(() => state.monitor.data?.error || null);
    const emptyList = computed(() => state.panels.length === 0 && !state.loadingPanels);
    const currentMonitorName = computed(() => {
      const p = state.panels.find((x) => x.id === state.monitorId);
      return p ? p.name : '';
    });
    const filteredApps = computed(() => {
      const q = (state.monitor.appSearch || '').trim().toLowerCase();
      if (!q) return state.monitor.apps;
      return state.monitor.apps.filter((a) =>
        (a.name || '').toLowerCase().includes(q) ||
        (a.appName || '').toLowerCase().includes(q) ||
        (a.path || '').toLowerCase().includes(q) ||
        String(a.httpPort || '').includes(q) ||
        String(a.httpsPort || '').includes(q)
      );
    });

    // 分类列表（去重，排除空）
    const categories = computed(() => {
      const set = new Set();
      state.panels.forEach((p) => { const c = (p.category || '').trim(); if (c) set.add(c); });
      return Array.from(set);
    });
    // 过滤后的面板（版本 → 状态 → 分类 → 搜索，可组合）
    const filteredPanels = computed(() => {
      let list = state.panels;
      if (state.activeVersion !== 'all') {
        list = list.filter((p) => String(p.version || '').toLowerCase() === state.activeVersion);
      }
      if (state.activeStatus === 'online') {
        list = list.filter((p) => p._online === true);
      } else if (state.activeStatus === 'offline') {
        list = list.filter((p) => p._online === false);
      }
      if (state.activeCategory !== 'all') {
        list = list.filter((p) => (p.category || '').trim() === state.activeCategory);
      }
      const q = state.search.trim().toLowerCase();
      if (q) {
        list = list.filter((p) =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.host || '').toLowerCase().includes(q) ||
          (p._base?.ipV4Addr || '').toLowerCase().includes(q) ||
          (p.remark || '').toLowerCase().includes(q) ||
          (p.category || '').toLowerCase().includes(q)
        );
      }
      return list;
    });
    const noFilterResult = computed(() => state.panels.length > 0 && filteredPanels.value.length === 0);
    function setCategory(c) { state.activeCategory = c; }
    function setVersion(v) { state.activeVersion = v; }
    function setStatus(s) { state.activeStatus = s; }

    return {
      state, loginPassword, fmt, toast,
      loadPanels, refreshPanel, refreshAll, openPanel, gotoMonitor, backToList,
      restartPanel, rebootPanel, deletePanel,
      panelForm, openAddPanel, openEditPanel, savePanel,
      passwordForm, openSettings, changePassword,
      doLogin, doLogout,
      fetchMonitor, fetchApps, operateApp, syncApps, openUpgrade, doUpgrade, colorFor,
      appStatusText, appStatusClass, filteredApps, iconError,
      diskUsedPercent, lastOf, monOnline, monError, emptyList, currentMonitorName,
      categories, filteredPanels, noFilterResult, setCategory, setVersion, setStatus,
      saveUiSettings,
    };
  },
  template: `
  <div>
    <!-- 登录 -->
    <div v-if="!state.loggedIn" class="login-wrap">
      <div class="login-card">
        <div class="logo-lg">1P</div>
        <h1>1Panel Manager</h1>
        <p>集中管理多个 1Panel 面板</p>
        <form @submit.prevent="doLogin">
          <div class="field">
            <label>后台密码</label>
            <input type="password" v-model="loginPassword" placeholder="请输入后台密码" autofocus />
          </div>
          <button class="btn btn-primary btn-block" type="submit">登 录</button>
        </form>
      </div>
    </div>

    <!-- 主界面 -->
    <div v-else class="app-shell">
      <!-- 顶部栏 -->
      <div class="topbar">
        <div class="brand">
          <span class="logo">1P</span>
          <span>1Panel Manager <small>集中管理多个 1Panel 面板</small></span>
        </div>
        <button class="btn btn-primary" @click="openAddPanel">+ 添加面板</button>
        <button class="btn" @click="openSettings">设置</button>
        <button class="btn btn-ghost" @click="doLogout">退出</button>
      </div>

      <!-- 面板列表 -->
      <template v-if="state.view === 'list'">
        <div class="list-toolbar">
          <div class="toolbar-row">
            <input class="search-input" v-model="state.search" placeholder="搜索名称 / IP / 备注 / 分类" />
            <span class="count">共 {{ state.panels.length }} 个</span>
            <span class="result-count" v-if="filteredPanels.length !== state.panels.length">命中 {{ filteredPanels.length }}</span>
          </div>

          <div class="filter-bar">
            <div class="filter-group">
              <span class="filter-label">版本</span>
              <button class="chip" :class="{ active: state.activeVersion === 'all' }" @click="setVersion('all')">全部</button>
              <button class="chip" :class="{ active: state.activeVersion === 'v1' }" @click="setVersion('v1')">V1</button>
              <button class="chip" :class="{ active: state.activeVersion === 'v2' }" @click="setVersion('v2')">V2</button>
            </div>
            <div class="filter-group">
              <span class="filter-label">状态</span>
              <button class="chip" :class="{ active: state.activeStatus === 'all' }" @click="setStatus('all')">全部</button>
              <button class="chip chip-online" :class="{ active: state.activeStatus === 'online' }" @click="setStatus('online')"><i class="dot"></i>在线</button>
              <button class="chip chip-offline" :class="{ active: state.activeStatus === 'offline' }" @click="setStatus('offline')"><i class="dot"></i>离线</button>
            </div>
            <div class="filter-group">
              <span class="filter-label">分类</span>
              <button class="chip" :class="{ active: state.activeCategory === 'all' }" @click="setCategory('all')">全部</button>
              <button v-for="c in categories" :key="c" class="chip" :class="{ active: state.activeCategory === c }" @click="setCategory(c)">{{ c }}</button>
            </div>
          </div>

          <div class="toolbar-row toolbar-actions">
            <label class="ctrl-label">
              <span class="switch">
                <input type="checkbox" v-model="state.list.autoRefresh" @change="saveUiSettings" />
                <span class="slider"></span>
              </span>
              自动刷新
            </label>
            <label class="ctrl-label">
              间隔
              <input type="number" min="1" v-model.number="state.list.interval" :disabled="!state.list.autoRefresh" @change="saveUiSettings" /> 秒
            </label>
            <button class="btn btn-sm" :disabled="state.loadingPanels" @click="refreshAll(false)">刷新全部</button>
          </div>
        </div>

        <div v-if="emptyList" class="empty">
          <div class="icon">🖥️</div>
          <h3>还没有面板</h3>
          <p>点击右上角「添加面板」开始管理你的 1Panel</p>
        </div>
        <div v-else-if="noFilterResult" class="empty">
          <div class="icon">🔍</div>
          <h3>没有匹配的机器</h3>
          <p>试试切换分类或调整搜索关键词</p>
        </div>

        <div class="grid">
          <div v-for="p in filteredPanels" :key="p.id" class="panel-card" :class="{ offline: p._online === false }">
            <div class="card-head">
              <div class="name">
                {{ p.name }}
                <span class="addr">{{ p.protocol }}://{{ p.host }}:{{ p.port }}{{ p.entry }}</span>
              </div>
              <span class="badge" :class="p._online === true ? 'online' : (p._online === false ? 'offline' : 'unknown')">
                <span class="dot"></span>{{ p._online === true ? '在线' : (p._online === false ? '离线' : '检测中') }}
              </span>
              <span class="badge version">{{ p.version.toUpperCase() }}</span>
              <span v-if="p.category" class="badge category">{{ p.category }}</span>
            </div>

            <div v-if="p._error" class="error-msg">{{ p._error }}</div>

            <div v-if="p._current" class="occupancy">
              <div class="metric">
                <span class="label">CPU</span>
                <ProgressBar :value="p._current.cpuUsedPercent" :color="colorFor(p._current.cpuUsedPercent)" />
                <span class="val">{{ fmt.pct(p._current.cpuUsedPercent) }}</span>
              </div>
              <div class="metric">
                <span class="label">内存</span>
                <ProgressBar :value="p._current.memoryUsedPercent" :color="colorFor(p._current.memoryUsedPercent)" />
                <span class="val">{{ fmt.pct(p._current.memoryUsedPercent) }}</span>
              </div>
              <div class="metric">
                <span class="label">磁盘</span>
                <ProgressBar :value="diskUsedPercent(p)" :color="colorFor(diskUsedPercent(p))" />
                <span class="val">{{ fmt.pct(diskUsedPercent(p)) }}</span>
              </div>
            </div>
            <div v-else-if="p._online !== true" class="error-msg">未获取到监控数据</div>

            <div v-if="p.remark" style="font-size:12px;color:var(--muted)">备注：{{ p.remark }}</div>

            <div class="card-actions">
              <div class="action-row">
                <button class="btn btn-primary btn-sm" @click="openPanel(p)">打开面板</button>
                <button class="btn btn-sm" @click="gotoMonitor(p.id)">管理面板</button>
                <button class="btn btn-sm" :disabled="p._refreshing" @click="refreshPanel(p.id)">刷新</button>
                <button class="btn btn-sm" @click="restartPanel(p)" title="重启面板">重启面板</button>
                <button class="btn btn-sm btn-danger" @click="rebootPanel(p)" title="重启所在系统">重启系统</button>
              </div>
              <div class="action-row action-manage">
                <button class="btn btn-sm" @click="openEditPanel(p)">编辑</button>
                <button class="btn btn-sm btn-danger" @click="deletePanel(p)">删除</button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 管理面板（页签） -->
      <template v-else-if="state.view === 'monitor'">
        <div class="monitor-head">
          <div class="title">
            <button class="btn btn-sm btn-ghost" @click="backToList">← 返回</button>
            <span>{{ currentMonitorName }}</span>
            <span class="badge" :class="monOnline ? 'online' : 'offline'">
              <span class="dot"></span>{{ monOnline ? '在线' : '离线' }}
            </span>
          </div>
          <div class="controls" v-if="!monError">
            <label>
              <span class="switch">
                <input type="checkbox" v-model="state.monitor.autoRefresh" @change="saveUiSettings" />
                <span class="slider"></span>
              </span>
              自动刷新
            </label>
            <label>
              间隔
              <input type="number" min="1" v-model.number="state.monitor.interval" :disabled="!state.monitor.autoRefresh" @change="saveUiSettings" /> 秒
            </label>
            <button class="btn btn-sm" :disabled="state.monitor.loading" @click="fetchMonitor">立即刷新</button>
          </div>
        </div>

        <!-- 异常时只显示错误，隐藏 tabs / 搜索栏 / 内容 -->
        <div v-if="monError" class="empty" style="padding:60px 20px">
          <div class="icon">🔌</div>
          <h3>无法连接该面板</h3>
          <p>{{ monError }}</p>
        </div>

        <template v-else>
        <!-- 页签导航 -->
        <div class="tabs">
          <button class="tab" :class="{ active: state.monitor.activeTab === 'home' }" @click="state.monitor.activeTab = 'home'; fetchMonitor()">首页</button>
          <button class="tab" :class="{ active: state.monitor.activeTab === 'apps' }" @click="state.monitor.activeTab = 'apps'; fetchApps()">应用</button>
        </div>

        <!-- ===== 首页 Tab ===== -->
        <template v-if="state.monitor.activeTab === 'home'">
          <!-- 面板统计 -->
          <div v-if="state.monitor.stats" class="section">
            <div class="section-title">面板概况</div>
            <div class="stat-grid">
              <div class="stat-card">
                <div class="k">网站</div>
                <div class="v">{{ state.monitor.stats.websiteNumber ?? '-' }}</div>
              </div>
              <div class="stat-card">
                <div class="k">应用</div>
                <div class="v">{{ state.monitor.stats.appInstalledNumber ?? '-' }}</div>
              </div>
              <div class="stat-card">
                <div class="k">数据库</div>
                <div class="v">{{ state.monitor.stats.databaseNumber ?? '-' }}</div>
              </div>
              <div class="stat-card">
                <div class="k">容器</div>
                <div class="v">{{ state.monitor.stats.containerNumber ?? '-' }}</div>
              </div>
              <div class="stat-card">
                <div class="k">面板版本</div>
                <div class="v" style="font-size:16px">{{ state.monitor.stats.systemVersion || '-' }}</div>
              </div>
            </div>
          </div>

          <div v-if="monOnline">
            <!-- 主机信息 -->
            <div class="section">
              <div class="section-title">主机信息</div>
              <div class="host-grid">
                <div class="host-item"><span class="hk">主机名</span><span class="hv">{{ state.monitor.data.base?.hostname || '-' }}</span></div>
                <div class="host-item"><span class="hk">操作系统</span><span class="hv">{{ state.monitor.data.base?.os || state.monitor.data.os?.os || '-' }}</span></div>
                <div class="host-item"><span class="hk">发行版</span><span class="hv">{{ state.monitor.data.base?.prettyDistro || state.monitor.data.os?.prettyDistro || '-' }}</span></div>
                <div class="host-item"><span class="hk">内核</span><span class="hv">{{ state.monitor.data.base?.kernelVersion || state.monitor.data.os?.kernelVersion || '-' }}</span></div>
                <div class="host-item"><span class="hk">架构</span><span class="hv">{{ state.monitor.data.base?.kernelArch || state.monitor.data.os?.kernelArch || '-' }}</span></div>
                <div class="host-item"><span class="hk">平台</span><span class="hv">{{ state.monitor.data.base?.platform || state.monitor.data.os?.platform || '-' }}</span></div>
                <div class="host-item"><span class="hk">CPU 型号</span><span class="hv">{{ state.monitor.data.base?.cpuModelName || '-' }}</span></div>
                <div class="host-item"><span class="hk">CPU 核心</span><span class="hv">{{ state.monitor.data.base?.cpuCores || '-' }} 核</span></div>
                <div class="host-item"><span class="hk">IP 地址</span><span class="hv">{{ state.monitor.data.base?.ipV4Addr || '-' }}</span></div>
                <div class="host-item"><span class="hk">运行时长</span><span class="hv">{{ fmt.uptime(state.monitor.data.current?.runningTime) }}</span></div>
              </div>
            </div>

            <!-- 实时指标 -->
            <div class="section">
              <div class="section-title">实时指标 <span style="color:var(--muted);font-weight:400;font-size:12px" v-if="state.monitor.data.current?.shotTime">采样于 {{ fmt.clock(state.monitor.data.current.shotTime) }}</span></div>
              <div class="stat-grid">
                <div class="stat-card">
                  <div class="k">CPU 使用率</div>
                  <div class="v" :style="{ color: colorFor(state.monitor.data.current?.cpuUsedPercent) }">{{ fmt.pct(state.monitor.data.current?.cpuUsedPercent) }}</div>
                  <div class="s">共 {{ state.monitor.data.current?.cpuTotal ?? '-' }} 核</div>
                </div>
                <div class="stat-card">
                  <div class="k">内存使用率</div>
                  <div class="v" :style="{ color: colorFor(state.monitor.data.current?.memoryUsedPercent) }">{{ fmt.pct(state.monitor.data.current?.memoryUsedPercent) }}</div>
                  <div class="s">{{ fmt.bytes(state.monitor.data.current?.memoryUsed) }} / {{ fmt.bytes(state.monitor.data.current?.memoryTotal) }}</div>
                </div>
                <div class="stat-card">
                  <div class="k">负载 (1/5/15 分钟)</div>
                  <div class="v" style="font-size:16px">{{ fmt.num(state.monitor.data.current?.load1) }} / {{ fmt.num(state.monitor.data.current?.load5) }} / {{ fmt.num(state.monitor.data.current?.load15) }}</div>
                  <div class="s">使用率 {{ fmt.pct(state.monitor.data.current?.loadUsagePercent) }}</div>
                </div>
                <div class="stat-card">
                  <div class="k">网络（收 / 发）</div>
                  <div class="v" style="font-size:16px">{{ fmt.bytes(state.monitor.data.current?.netBytesRecv) }} ↓</div>
                  <div class="s">{{ fmt.bytes(state.monitor.data.current?.netBytesSent) }} ↑</div>
                </div>
              </div>
            </div>

            <!-- 磁盘 -->
            <div class="section">
              <div class="section-title">磁盘</div>
              <div class="disk-list">
                <div v-for="(d, i) in state.monitor.data.current?.diskData || []" :key="i" class="disk-item">
                  <span class="path">{{ d.path }}</span>
                  <div class="bar"><span :style="{ width: fmt.pct(d.usedPercent), background: colorFor(d.usedPercent) }"></span></div>
                  <span class="info">{{ fmt.pct(d.usedPercent) }} · {{ fmt.bytes(d.used) }} / {{ fmt.bytes(d.total) }}</span>
                </div>
                <div v-if="!(state.monitor.data.current?.diskData || []).length" class="error-msg">无磁盘数据</div>
              </div>
            </div>

            <!-- 历史趋势 -->
            <div class="section">
              <div class="section-title">历史趋势（最近 30 分钟）</div>
              <div class="chart-grid">
                <div class="chart-card">
                  <div class="cc-head">
                    <span class="t">CPU 使用率</span>
                    <span class="cur">{{ fmt.pct(lastOf(state.monitor.data.series?.cpu?.values)) }}</span>
                  </div>
                  <LineChart :values="state.monitor.data.series?.cpu?.values" color="#3b82f6" />
                </div>
                <div class="chart-card">
                  <div class="cc-head">
                    <span class="t">内存使用率</span>
                    <span class="cur">{{ fmt.pct(lastOf(state.monitor.data.series?.memory?.values)) }}</span>
                  </div>
                  <LineChart :values="state.monitor.data.series?.memory?.values" color="#8b5cf6" />
                </div>
                <div class="chart-card">
                  <div class="cc-head">
                    <span class="t">系统负载（1 分钟）</span>
                    <span class="cur">{{ fmt.num(lastOf(state.monitor.data.series?.load?.values)) }}</span>
                  </div>
                  <LineChart :values="state.monitor.data.series?.load?.values" color="#f59e0b" />
                </div>
              </div>
            </div>
          </div>
          <div v-else-if="!state.monitor.loading" class="empty">
            <div class="icon">🔌</div>
            <h3>无法连接该面板</h3>
            <p>{{ state.monitor.data?.error || '请检查面板地址、端口与接口密钥' }}</p>
          </div>
        </template>

        <!-- ===== 应用 Tab ===== -->
        <template v-if="state.monitor.activeTab === 'apps'">
          <div class="section">
            <div class="app-toolbar">
              <input class="app-search" v-model="state.monitor.appSearch" placeholder="搜索应用名称 / 端口 / 路径..." />
              <div class="app-toolbar-actions">
                <span class="count">{{ filteredApps.length }} / {{ state.monitor.apps.length }}</span>
                <button class="btn btn-sm" :disabled="state.monitor.appsLoading" @click="fetchApps">刷新</button>
                <button class="btn btn-sm" @click="syncApps">同步</button>
              </div>
            </div>
            <div v-if="state.monitor.appsLoading" style="text-align:center;padding:40px;color:var(--muted)">加载中...</div>
            <div v-else-if="state.monitor.apps.length === 0" class="empty" style="padding:40px">
              <div class="icon">📦</div>
              <h3>暂无已安装应用</h3>
              <p>请前往 1Panel 面板的应用商店安装应用</p>
            </div>
            <div v-else-if="filteredApps.length === 0" class="empty" style="padding:40px">
              <div class="icon">🔍</div>
              <h3>没有匹配的应用</h3>
              <p>试试调整搜索关键词</p>
            </div>
            <div v-else class="app-list">
              <div v-for="app in filteredApps" :key="app.id" class="app-card" :class="{ 'has-update': app.canUpdate }">
                <img v-if="app.iconUrl && !app.iconError" :src="app.iconUrl" class="app-icon" loading="lazy" alt="" @error="iconError(app)" />
                <div v-else class="app-icon app-icon-placeholder">{{ (app.name || '?')[0] }}</div>
                <div class="app-info">
                  <div class="app-name-row">
                    <span class="app-name">{{ app.name }}</span>
                    <span v-if="app.version" class="app-version">v{{ app.version }}</span>
                    <span v-if="app.canUpdate" class="upgrade-badge">可升级</span>
                  </div>
                  <div class="app-meta-row">
                    <span class="badge" :class="appStatusClass(app.status)"><span class="dot"></span>{{ appStatusText(app.status) }}</span>
                    <span v-if="app.httpPort" class="port-tag">HTTP {{ app.httpPort }}</span>
                    <span v-if="app.httpsPort" class="port-tag">HTTPS {{ app.httpsPort }}</span>
                  </div>
                  <div v-if="app.path" class="app-path" :title="app.path">📁 {{ app.path }}</div>
                  <div class="app-footer">
                    <span v-if="app.createdAt" class="app-meta-text">创建于 {{ app.createdAt.slice(0, 10) }}</span>
                    <div class="app-actions">
                      <button class="btn btn-sm" :disabled="state.monitor.appOps[app.id]" @click="operateApp(app, 'start')" v-if="app.status.toLowerCase() !== 'running'">启动</button>
                      <button class="btn btn-sm" :disabled="state.monitor.appOps[app.id]" @click="operateApp(app, 'stop')" v-if="app.status.toLowerCase() === 'running'">停止</button>
                      <button class="btn btn-sm" :disabled="state.monitor.appOps[app.id]" @click="operateApp(app, 'restart')">重启</button>
                      <button class="btn btn-sm" :disabled="state.monitor.appOps[app.id]" @click="openUpgrade(app)" v-if="app.canUpdate">升级</button>
                      <button class="btn btn-sm btn-danger" :disabled="state.monitor.appOps[app.id]" @click="operateApp(app, 'uninstall')">卸载</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
        </template>
      </template>
    </div>

    <!-- 添加/编辑面板 -->
    <div v-if="state.showPanelForm" class="modal-mask" @click.self="state.showPanelForm = false">
      <div class="modal">
        <h2>{{ state.editingPanel ? '编辑面板' : '添加面板' }}</h2>
        <div class="field">
          <label>面板名称 *</label>
          <input v-model="panelForm.name" placeholder="例如：家里 NAS" />
        </div>
        <div class="form-row">
          <div class="field">
            <label>协议</label>
            <select v-model="panelForm.protocol"><option value="http">http</option><option value="https">https</option></select>
          </div>
          <div class="field">
            <label>主机地址 *</label>
            <input v-model="panelForm.host" placeholder="192.168.1.10 或域名" />
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label>端口</label>
            <input type="number" v-model.number="panelForm.port" placeholder="8888" />
          </div>
          <div class="field">
            <label>安全入口</label>
            <input v-model="panelForm.entry" placeholder="1panel（可空）" />
          </div>
        </div>
        <div class="field">
          <label>面板版本</label>
          <select v-model="panelForm.version"><option value="v2">V2</option><option value="v1">V1</option></select>
        </div>
        <div class="field">
          <label>接口密钥（API Key）</label>
          <input v-model="panelForm.apiKey" placeholder="1Panel API Key" />
        </div>
        <div class="field">
          <label>分类</label>
          <input v-model="panelForm.category" placeholder="例如：生产 / 测试（可空）" list="category-list" />
          <datalist id="category-list">
            <option v-for="c in categories" :key="c" :value="c"></option>
          </datalist>
        </div>
        <div class="field">
          <label>备注</label>
          <textarea v-model="panelForm.remark" placeholder="可选"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn" @click="state.showPanelForm = false">取消</button>
          <button class="btn btn-primary" @click="savePanel">保存</button>
        </div>
      </div>
    </div>

    <!-- 设置 -->
    <div v-if="state.showSettings" class="modal-mask" @click.self="state.showSettings = false">
      <div class="modal">
        <h2>设置</h2>
        <div class="field">
          <label>原密码</label>
          <input type="password" v-model="passwordForm.oldPassword" />
        </div>
        <div class="field">
          <label>新密码（至少 6 位）</label>
          <input type="password" v-model="passwordForm.newPassword" />
        </div>
        <div class="field">
          <label>确认新密码</label>
          <input type="password" v-model="passwordForm.confirm" />
        </div>
        <div class="modal-actions">
          <button class="btn" @click="state.showSettings = false">取消</button>
          <button class="btn btn-primary" @click="changePassword">保存</button>
        </div>
      </div>
    </div>

    <!-- 应用升级弹窗 -->
    <div v-if="state.monitor.upgradeApp" class="modal-mask" @click.self="state.monitor.upgradeApp = null">
      <div class="modal">
        <h2>升级「{{ state.monitor.upgradeApp.name }}」</h2>
        <div class="field">
          <label>当前版本</label>
          <div class="upgrade-current">v{{ state.monitor.upgradeApp.version }}</div>
        </div>
        <div class="field">
          <label>选择目标版本</label>
          <div v-if="state.monitor.upgradeLoading" style="text-align:center;padding:20px;color:var(--muted)">加载中...</div>
          <div v-else-if="state.monitor.upgradeVersions.length === 0" class="error-msg">暂无可用升级版本</div>
          <select v-else class="upgrade-select" v-model.number="state.monitor.upgradeIndex">
            <option v-for="(ver, i) in state.monitor.upgradeVersions" :key="ver.detailId || i" :value="i">
              {{ ver.version }}{{ i === 0 ? '（最新）' : '' }}
            </option>
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn" @click="state.monitor.upgradeApp = null">取消</button>
          <button class="btn btn-primary" :disabled="state.monitor.upgradeLoading || state.monitor.upgradeVersions.length === 0" @click="doUpgrade(state.monitor.upgradeApp, state.monitor.upgradeVersions[state.monitor.upgradeIndex])">
            确认升级
          </button>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <div v-if="state.toast" class="toast" :class="state.toast.type">{{ state.toast.msg }}</div>
  </div>
  `,
};

// 供模板使用的辅助函数
function diskUsedPercent(p) {
  const disks = p._current?.diskData;
  if (!disks || !disks.length) return null;
  const used = disks.reduce((s, d) => s + (Number(d.used) || 0), 0);
  const total = disks.reduce((s, d) => s + (Number(d.total) || 0), 0);
  if (!total) return null;
  return (used / total) * 100;
}
function lastOf(arr) {
  if (!arr || !arr.length) return null;
  for (let i = arr.length - 1; i >= 0; i--) { if (typeof arr[i] === 'number') return arr[i]; }
  return null;
}

const app = createApp(App);
app.mount('#app');
