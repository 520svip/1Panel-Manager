// 业务操作函数（从原 app.js 迁移）
import { api } from '@/api';
import { panelsStore, monitorStore, toast } from '@/stores';

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

export const REFRESH_CONCURRENCY = 5; // 同时刷新最多 5 台

export function normalizeEntry(entry) {
  if (!entry) return '';
  let e = String(entry).trim();
  if (e && !e.startsWith('/')) e = '/' + e;
  return e;
}

// 显示用：安全入口补前导 "/"（存储值不含 /，拼接地址时展示）
export function panelEntry(entry) {
  if (!entry) return '';
  const e = String(entry).trim();
  return e.startsWith('/') ? e : '/' + e;
}

export async function loadPanels() {
  panelsStore.loading = true;
  try {
    panelsStore.list = await api('/api/panels');
    await mapLimit(panelsStore.list, REFRESH_CONCURRENCY, (p) => refreshPanel(p.id, true));
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    panelsStore.loading = false;
  }
}

export async function refreshPanel(id, silent = false) {
  const p = panelsStore.list.find((x) => x.id === id);
  if (!p) return;
  if (p._refreshing) return; // 防止并发重复请求
  p._refreshing = true;
  try {
    const data = await api(`/api/panels/${id}/refresh`, { method: 'POST' });
    p._online = data.online;
    p._error = data.error;
    p._current = data.current;
    p._base = data.base;
    p._noData = !!data.noData;
    p._noDataHint = data.noDataHint || null;
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
export async function refreshAll(silent = false) {
  if (refreshingAll) return;
  refreshingAll = true;
  try {
    await mapLimit(panelsStore.list, REFRESH_CONCURRENCY, (p) => refreshPanel(p.id, true));
    if (!silent) toast('已刷新全部面板');
  } finally {
    refreshingAll = false;
  }
}

export function openPanel(p) {
  const url = `${p.protocol}://${p.host}:${p.port}${normalizeEntry(p.entry)}`;
  window.open(url, '_blank', 'noopener');
}

export async function restartPanel(p) {
  if (!confirm(`确定要重启面板「${p.name}」吗？`)) return;
  try {
    const r = await api(`/api/panels/${p.id}/restart`, { method: 'POST' });
    toast(r && r.message ? r.message : '重启指令已下发', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

export async function rebootPanel(p) {
  if (!confirm(`确定要重启「${p.name}」所在服务器系统吗？此操作会中断服务，请谨慎！`)) return;
  try {
    const r = await api(`/api/panels/${p.id}/reboot`, { method: 'POST' });
    toast(r && r.message ? r.message : '重启系统指令已下发', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

export async function deletePanel(p) {
  if (!confirm(`确定要删除面板「${p.name}」的配置信息吗？`)) return;
  try {
    await api(`/api/panels/${p.id}`, { method: 'DELETE' });
    panelsStore.list = panelsStore.list.filter((x) => x.id !== p.id);
    toast('已删除', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ---- 面板表单 ----
export function blankForm() {
  return {
    name: '', protocol: 'http', host: '', port: 8888, entry: '', version: 'v2', apiKey: '', remark: '', category: '',
  };
}

export async function savePanel(form, editing) {
  if (!form.name || !form.host) {
    toast('请填写名称和主机地址', 'error');
    return false;
  }
  const body = { ...form, port: Number(form.port) || 8888 };
  try {
    if (editing) {
      const updated = await api(`/api/panels/${editing.id}`, { method: 'PUT', body });
      const idx = panelsStore.list.findIndex((x) => x.id === updated.id);
      if (idx >= 0) panelsStore.list.splice(idx, 1, updated);
      toast('已保存', 'success');
    } else {
      const created = await api('/api/panels', { method: 'POST', body });
      panelsStore.list.push(created);
      toast('已添加', 'success');
    }
    refreshPanel(editing ? editing.id : panelsStore.list[panelsStore.list.length - 1].id, true);
    return true;
  } catch (e) {
    toast(e.message, 'error');
    return false;
  }
}

// ---- 设置 ----
export async function changePassword(form) {
  if (form.newPassword.length < 6) {
    toast('新密码至少 6 位', 'error');
    return false;
  }
  if (form.newPassword !== form.confirm) {
    toast('两次输入的新密码不一致', 'error');
    return false;
  }
  try {
    await api('/api/settings/password', {
      method: 'POST',
      body: { oldPassword: form.oldPassword, newPassword: form.newPassword },
    });
    toast('密码已修改', 'success');
    return true;
  } catch (e) {
    toast(e.message, 'error');
    return false;
  }
}

// ---- 登录 ----
export async function doLogin(password, onOk) {
  if (!password) return;
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: { password } });
    localStorage.setItem('pm_token', data.token);
    onOk && onOk();
  } catch (e) {
    toast(e.message, 'error');
  }
}

export async function doLogout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  localStorage.removeItem('pm_token');
}

// ---- UI 设置持久化 ----
export async function loadUiSettings() {
  try {
    const s = await api('/api/settings/ui');
    panelsStore.autoRefresh = s.listAutoRefresh;
    panelsStore.interval = s.listInterval;
    monitorStore.autoRefresh = s.monitorAutoRefresh;
    monitorStore.interval = s.monitorInterval;
  } catch (e) {
    // 加载失败则保留默认值
  }
}

export async function saveUiSettings() {
  try {
    await api('/api/settings/ui', {
      method: 'POST',
      body: {
        listAutoRefresh: panelsStore.autoRefresh,
        listInterval: panelsStore.interval,
        monitorAutoRefresh: monitorStore.autoRefresh,
        monitorInterval: monitorStore.interval,
      },
    });
  } catch (e) {
    // 静默忽略，避免打扰用户
  }
}

// ---- 监控 ----
export function normalizeHistory(history) {
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

export async function fetchMonitor() {
  const id = monitorStore.id;
  if (!id) return;
  if (monitorStore.loading) return; // 防止上一次请求未完成时重叠发起
  monitorStore.loading = true;
  try {
    const data = await api(`/api/panels/${id}/monitor`);
    data.series = normalizeHistory(data.history);
    monitorStore.data = data;
    if (data.stats) monitorStore.stats = data.stats;
    monitorStore.lastUpdate = new Date();
    monitorStore.error = null;
  } catch (e) {
    monitorStore.data = monitorStore.data || null;
    monitorStore.error = e.message;
    toast(e.message, 'error');
  } finally {
    monitorStore.loading = false;
  }
}

// 已安装应用列表（应用商店）
export async function fetchApps() {
  const id = monitorStore.id;
  if (!id) return;
  if (monitorStore.appsLoading) return;
  monitorStore.appsLoading = true;
  try {
    const token = localStorage.getItem('pm_token') || '';
    const apps = (await api(`/api/panels/${id}/apps`)) || [];
    // <img> 无法带 Authorization 头，把会话 token 拼到图标 URL 上
    monitorStore.apps = apps.map((a) => {
      if (a.iconUrl && token && !a.iconUrl.startsWith('data:')) {
        a.iconUrl += (a.iconUrl.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token);
      }
      return a;
    });
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    monitorStore.appsLoading = false;
  }
}

// 操作应用：start / stop / restart / uninstall（uninstall 会打开弹窗）
export async function operateApp(app, operate) {
  const labels = { start: '启动', stop: '停止', restart: '重启', uninstall: '卸载' };
  const label = labels[operate] || operate;
  if (operate === 'uninstall') {
    monitorStore.uninstallApp = app;
    return;
  }
  if (!confirm(`确定要对「${app.name}」执行「${label}」操作吗？`)) return;
  const key = app.id;
  if (monitorStore.appOps[key]) return;
  monitorStore.appOps[key] = true;
  try {
    const r = await api(`/api/panels/${monitorStore.id}/apps/${app.id}/op`, {
      method: 'POST',
      body: { operate },
    });
    toast(r && r.message ? r.message : `「${label}」操作已下发`, 'success');
    // 稍等片刻再刷新列表，让状态有时间更新
    setTimeout(fetchApps, 1500);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    monitorStore.appOps[key] = false;
  }
}

// 执行卸载（从 modal 确认）
export async function doUninstall() {
  const app = monitorStore.uninstallApp;
  if (!app) return;
  const opts = monitorStore.uninstallOpts;
  const key = app.id;
  if (monitorStore.appOps[key]) return;
  monitorStore.appOps[key] = true;
  monitorStore.uninstallApp = null;
  try {
    const panel = panelsStore.list.find((x) => x.id === monitorStore.id);
    const isV2 = panel && panel.version !== 'v1';
    const extra = {
      forceDelete: !!opts.forceDelete,
      deleteBackup: !!opts.deleteBackup,
    };
    if (isV2) {
      // V2 才支持 deleteImage / deleteDB / taskID
      if (opts.deleteImage) extra.deleteImage = true;
      // V2 默认勾选"删除关联数据库"
      if (opts.deleteDB) extra.deleteDB = true;
      extra.taskID = crypto.randomUUID();
    }
    const r = await api(`/api/panels/${monitorStore.id}/apps/${app.id}/op`, {
      method: 'POST',
      body: { operate: 'uninstall', ...extra },
    });
    toast(r && r.message ? r.message : '卸载指令已下发', 'success');
    setTimeout(fetchApps, 1500);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    monitorStore.appOps[key] = false;
  }
}

// 同步应用商店
export async function syncApps() {
  try {
    const r = await api(`/api/panels/${monitorStore.id}/apps/sync`, { method: 'POST' });
    toast(r && r.message ? r.message : '已触发应用商店同步', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

// 打开升级弹窗（优先使用"检查更新"时已缓存的版本列表）
export async function openUpgrade(app) {
  monitorStore.upgradeApp = app;
  monitorStore.upgradeIndex = 0;
  if (app.updateVersions && app.updateVersions.length) {
    monitorStore.upgradeVersions = app.updateVersions;
    monitorStore.upgradeLoading = false;
    return;
  }
  monitorStore.upgradeVersions = [];
  monitorStore.upgradeLoading = true;
  try {
    const versions = await api(`/api/panels/${monitorStore.id}/apps/${app.id}/versions`);
    monitorStore.upgradeVersions = versions || [];
  } catch (e) {
    toast(e.message, 'error');
    monitorStore.upgradeApp = null;
  } finally {
    monitorStore.upgradeLoading = false;
  }
}

// 执行升级
export async function doUpgrade(app, version) {
  if (!confirm(`确定将「${app.name}」升级到 ${version.version} 吗？`)) return;
  const key = app.id;
  if (monitorStore.appOps[key]) return;
  monitorStore.appOps[key] = true;
  try {
    const r = await api(`/api/panels/${monitorStore.id}/apps/${app.id}/op`, {
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
    monitorStore.upgradeApp = null;
    setTimeout(fetchApps, 1500);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    monitorStore.appOps[key] = false;
  }
}

// 图标加载失败（404/网络错误）时回退为文字占位
export function iconError(app) {
  app.iconError = true;
}

// 磁盘使用率（列表卡片里）
export function diskUsedPercent(p) {
  const disks = p._current?.diskData;
  if (!disks || !disks.length) return null;
  const used = disks.reduce((s, d) => s + (Number(d.used) || 0), 0);
  const total = disks.reduce((s, d) => s + (Number(d.total) || 0), 0);
  if (!total) return null;
  return (used / total) * 100;
}
