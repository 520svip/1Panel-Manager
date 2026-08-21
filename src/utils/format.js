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
    if (v == null || v === '') return '-';
    const n = Number(v);
    if (!isNaN(n)) {
      let x = n;
      const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
      let i = 0;
      while (x >= 1024 && i < u.length - 1) { x /= 1024; i++; }
      return (i === 0 ? x.toFixed(0) : x.toFixed(1)) + ' ' + u[i];
    }
    // 已是带单位的格式化字符串（如 V1 镜像的 "1.50MB"），美化空格后直接返回
    return String(v).trim().replace(/\s*([KMGTPE]?B|i?B)$/i, ' $1');
  },
  pct(v) { return (v == null || isNaN(v)) ? '-' : Number(v).toFixed(1) + '%'; },
  // 容器 CPU：面板按增量比例返回，值经常是 0.000x 级别，toFixed(1) 会全部显示成 0.0，
  // 因此按量级自适应精度，极小值显示为 ~0%
  cpuPct(v) {
    if (v == null || isNaN(v)) return '-';
    const n = Number(v);
    if (n < 0.0005) return '~0%';
    if (n < 0.01) return n.toPrecision(2).replace(/0+$/, '') + '%';
    if (n < 10) return String(parseFloat(n.toFixed(2))) + '%';
    return n.toFixed(1) + '%';
  },
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
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
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
const APP_STATUS_TEXT = {
  running: '运行中',
  stopped: '已停止',
  unhealthy: '不健康',
  error: '错误',
  notexist: '未安装',
  uninstall: '已卸载',
  creating: '创建中',
  installing: '安装中',
  uninstalling: '卸载中',
  rebuilding: '重建中',
  upgrading: '升级中',
  restarting: '重启中',
  stopping: '停止中',
  starting: '启动中',
  deleting: '删除中',
};

export function appStatusText(s) {
  if (!s) return '-';
  return APP_STATUS_TEXT[String(s).toLowerCase()] || String(s);
}

export function appStatusClass(s) {
  if (!s) return 'unknown';
  const st = String(s).toLowerCase();
  if (st === 'running' || st === 'up') return 'online';
  if (['creating', 'installing', 'uninstalling', 'rebuilding', 'upgrading', 'restarting', 'stopping', 'starting', 'deleting', 'unhealthy', 'error'].includes(st)) return 'warning';
  return 'offline';
}

// 容器状态文案（1Panel container state）
export function containerStateText(s) {
  if (!s) return '-';
  s = String(s).toLowerCase();
  const map = { running: '运行中', exited: '已停止', paused: '已暂停', created: '已创建', dead: '已失效', restarting: '重启中', removing: '删除中' };
  return map[s] || s;
}

export function containerStateClass(s) {
  if (!s) return 'unknown';
  s = String(s).toLowerCase();
  if (s === 'running' || s === 'created' || s === 'restarting') return 'online';
  if (s === 'paused') return 'warning';
  return 'offline';
}

// 容器端口文本（兼容数组 / 字符串两种结构）
export function containerPortsText(c) {
  const p = c && c.ports;
  if (!p) return '';
  if (Array.isArray(p)) {
    return p.map((x) => {
      if (!x || typeof x !== 'object') return '';
      const host = x.hostPort || x.hostIpPort;
      const cont = x.containerPort;
      const proto = x.protocol || x.type || 'tcp';
      if (host && cont) return `${host}->${cont}/${proto}`;
      if (cont) return `${cont}/${proto}`;
      if (host) return `${host}/${proto}`;
      return '';
    }).filter(Boolean).join(', ');
  }
  return String(p);
}

// 容器 CPU 百分比（兼容直接字段 / stats 嵌套）
export function containerCpuPercent(c) {
  const v = c && (c.cpuPercent ?? c.stats?.cpuPercent);
  return v == null || isNaN(v) ? null : Number(v);
}

// 容器内存使用量（字节）
export function containerMemoryUsage(c) {
  const v = c && (c.memoryUsage ?? c.stats?.memoryUsage);
  return v == null || isNaN(v) ? null : Number(v);
}

// 容器内存限制（字节）
export function containerMemoryLimit(c) {
  const v = c && (c.memoryLimit ?? c.stats?.memoryLimit);
  return v == null || isNaN(v) ? null : Number(v);
}

// 容器内存使用率（百分比）
export function containerMemoryPercent(c) {
  const v = c && (c.memoryPercent ?? c.stats?.memoryPercent);
  return v == null || isNaN(v) ? null : Number(v);
}

// 容器内存文本，如：256MB / 1GB (25%)
export function containerMemoryText(c) {
  const usage = containerMemoryUsage(c);
  const limit = containerMemoryLimit(c);
  const pct = containerMemoryPercent(c);
  if (usage == null && limit == null) return pct != null ? `${pct.toFixed(1)}%` : '-';
  const parts = [];
  if (usage != null) parts.push(fmt.bytes(usage));
  if (limit != null) parts.push(fmt.bytes(limit));
  const text = parts.join(' / ');
  return pct != null ? `${text} (${pct.toFixed(1)}%)` : text;
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
