// 格式化工具函数（从原 app.js 迁移）

export function parseTs(s) {
  if (s == null) return null;
  if (typeof s === 'number') return new Date(s);
  let str = String(s);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) str = str.replace(' ', 'T');
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

export const fmt = {
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
    if (rt == null || rt === '' || rt === 0) return '-';
    if (typeof rt === 'object') {
      const parts = [];
      if (rt.days) parts.push(rt.days + '天');
      if (rt.hours) parts.push(rt.hours + '时');
      if (rt.minutes) parts.push(rt.minutes + '分');
      return parts.join(' ') || '-';
    }
    const sec = Number(rt) || 0;
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const parts = [];
    if (d) parts.push(d + '天');
    if (h) parts.push(h + '时');
    parts.push(m + '分');
    return parts.join(' ');
  },
  maskKey(k) {
    if (!k) return '-';
    k = String(k);
    if (k.length <= 8) return k;
    return k.slice(0, 4) + '...' + k.slice(-4);
  },
  firstLetter(name) {
    if (!name) return '?';
    return String(name).trim().charAt(0).toUpperCase();
  },
};

// 根据数值返回颜色（用于 CPU/内存/磁盘占比）
export function colorFor(v) {
  if (v == null || isNaN(v)) return 'var(--muted)';
  v = Number(v);
  if (v < 60) return 'var(--green)';
  if (v < 85) return 'var(--orange)';
  return 'var(--red)';
}

// 应用状态文案
export function appStatusText(s) {
  if (!s) return '-';
  s = String(s).toLowerCase();
  if (s === 'running') return '运行中';
  if (s === 'stopped') return '已停止';
  if (s === 'uninstall') return '已卸载';
  return s;
}

export function appStatusClass(s) {
  if (!s) return 'unknown';
  s = String(s).toLowerCase();
  if (s === 'running' || s === 'up') return 'online';
  return 'offline';
}

// 磁盘使用率
export function diskUsedPercent(d) {
  if (!d) return null;
  if (d.usedPercent != null) return d.usedPercent;
  if (d.total && d.used != null) return (d.used / d.total) * 100;
  return null;
}

// 取数组最后一个非空值
export function lastOf(arr) {
  if (!Array.isArray(arr)) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null) return arr[i];
  }
  return null;
}
