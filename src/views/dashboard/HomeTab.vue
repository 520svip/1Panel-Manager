<template>
  <div>
    <div v-if="monitorStore.stats" class="section">
      <div class="section-title">面板概况</div>
      <div class="stat-grid">
        <div class="stat-card"><div class="k">网站</div><div class="v">{{ monitorStore.stats.websiteNumber ?? '-' }}</div></div>
        <div class="stat-card"><div class="k">应用</div><div class="v">{{ monitorStore.stats.appInstalledNumber ?? '-' }}</div></div>
        <div class="stat-card"><div class="k">数据库</div><div class="v">{{ monitorStore.stats.databaseNumber ?? '-' }}</div></div>
        <div class="stat-card"><div class="k">容器</div><div class="v">{{ monitorStore.stats.containerNumber ?? '-' }}</div></div>
        <div class="stat-card"><div class="k">面板版本</div><div class="v" style="font-size:16px">{{ monitorStore.stats.systemVersion || '-' }}</div></div>
      </div>
    </div>

    <div v-if="online">
      <div class="section">
        <div class="section-title">主机信息</div>
        <div class="host-grid">
          <div class="host-item"><span class="hk">主机名</span><span class="hv">{{ monitorStore.data?.base?.hostname || '-' }}</span></div>
          <div class="host-item"><span class="hk">操作系统</span><span class="hv">{{ monitorStore.data?.base?.os || monitorStore.data?.os?.os || '-' }}</span></div>
          <div class="host-item"><span class="hk">发行版</span><span class="hv">{{ monitorStore.data?.base?.prettyDistro || monitorStore.data?.os?.prettyDistro || monitorStore.data?.base?.platformVersion || '-' }}</span></div>
          <div class="host-item"><span class="hk">内核</span><span class="hv">{{ monitorStore.data?.base?.kernelVersion || monitorStore.data?.os?.kernelVersion || '-' }}</span></div>
          <div class="host-item"><span class="hk">架构</span><span class="hv">{{ monitorStore.data?.base?.kernelArch || monitorStore.data?.os?.kernelArch || '-' }}</span></div>
          <div class="host-item"><span class="hk">平台</span><span class="hv">{{ monitorStore.data?.base?.platform || monitorStore.data?.os?.platform || '-' }}</span></div>
          <div class="host-item"><span class="hk">CPU 型号</span><span class="hv">{{ monitorStore.data?.base?.cpuModelName || '-' }}</span></div>
          <div class="host-item"><span class="hk">CPU 核心</span><span class="hv">{{ monitorStore.data?.base?.cpuCores || '-' }} 核</span></div>
          <div class="host-item"><span class="hk">IP 地址</span><span class="hv">{{ monitorStore.data?.base?.ipV4Addr || monitorStore.data?.base?.ipv4Addr || '-' }}</span></div>
          <div class="host-item"><span class="hk">运行时长</span><span class="hv">{{ fmt.uptime(monitorStore.data?.current?.runningTime || monitorStore.data?.current?.uptime) }}</span></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">实时指标 <span style="color:var(--muted);font-weight:400;font-size:12px" v-if="monitorStore.data?.current?.shotTime">采样于 {{ fmt.clock(monitorStore.data.current.shotTime) }}</span></div>
        <div class="stat-grid">
          <div class="stat-card">
            <div class="k">CPU 使用率</div>
            <div class="v" :style="{ color: colorFor(monitorStore.data?.current?.cpuUsedPercent) }">{{ fmt.pct(monitorStore.data?.current?.cpuUsedPercent) }}</div>
            <div class="s">共 {{ monitorStore.data?.current?.cpuTotal ?? '-' }} 核</div>
          </div>
          <div class="stat-card">
            <div class="k">内存使用率</div>
            <div class="v" :style="{ color: colorFor(monitorStore.data?.current?.memoryUsedPercent) }">{{ fmt.pct(monitorStore.data?.current?.memoryUsedPercent) }}</div>
            <div class="s">{{ fmt.bytes(monitorStore.data?.current?.memoryUsed) }} / {{ fmt.bytes(monitorStore.data?.current?.memoryTotal) }}</div>
          </div>
          <div class="stat-card">
            <div class="k">负载 (1/5/15 分钟)</div>
            <div class="v" style="font-size:16px">{{ fmt.num(monitorStore.data?.current?.load1) }} / {{ fmt.num(monitorStore.data?.current?.load5) }} / {{ fmt.num(monitorStore.data?.current?.load15) }}</div>
            <div class="s">使用率 {{ fmt.pct(monitorStore.data?.current?.loadUsagePercent) }}</div>
          </div>
          <div class="stat-card">
            <div class="k">网络（收 / 发）</div>
            <div class="v" style="font-size:16px">{{ fmt.bytes(monitorStore.data?.current?.netBytesRecv) }} ↓</div>
            <div class="s">{{ fmt.bytes(monitorStore.data?.current?.netBytesSent) }} ↑</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">磁盘</div>
        <div class="disk-list">
          <div v-for="(d, i) in monitorStore.data?.current?.diskData || []" :key="i" class="disk-item">
            <span class="path">{{ d.path }}</span>
            <div class="bar"><span :style="{ width: fmt.pct(d.usedPercent), background: colorFor(d.usedPercent) }"></span></div>
            <span class="info">{{ fmt.pct(d.usedPercent) }} · {{ fmt.bytes(d.used) }} / {{ fmt.bytes(d.total) }}</span>
          </div>
          <div v-if="!(monitorStore.data?.current?.diskData || []).length" class="error-msg">无磁盘数据</div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">历史趋势（最近 30 分钟）</div>
        <div class="chart-grid">
          <div class="chart-card">
            <div class="cc-head"><span class="t">平均负载</span><span class="cur">{{ fmt.num(lastOf(monitorStore.data?.series?.load?.values)) }}</span></div>
            <LineChart :values="monitorStore.data?.series?.load?.values" color="#f59e0b" :height="60" />
          </div>
          <div class="chart-card">
            <div class="cc-head"><span class="t">CPU 使用率</span><span class="cur">{{ fmt.pct(lastOf(monitorStore.data?.series?.cpu?.values)) }}</span></div>
            <LineChart :values="monitorStore.data?.series?.cpu?.values" color="#3b82f6" :height="60" />
          </div>
          <div class="chart-card">
            <div class="cc-head"><span class="t">内存使用率</span><span class="cur">{{ fmt.pct(lastOf(monitorStore.data?.series?.memory?.values)) }}</span></div>
            <LineChart :values="monitorStore.data?.series?.memory?.values" color="#8b5cf6" :height="60" />
          </div>
          <div class="chart-card">
            <div class="cc-head"><span class="t">硬盘 IO</span><span class="cur">{{ fmt.bytes(diskIoCur) }}</span></div>
            <LineChart :values="diskIoValues" color="#10b981" :height="60" />
          </div>
          <div class="chart-card">
            <div class="cc-head"><span class="t">网络（收 + 发）</span><span class="cur">{{ fmt.bytes(netCur) }}</span></div>
            <LineChart :values="netValues" color="#06b6d4" :height="60" />
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="!monitorStore.loading" class="empty">
      <div class="icon">🔌</div>
      <h3>无法连接该面板</h3>
      <p>{{ monitorStore.data?.error || '请检查面板地址、端口与接口密钥' }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import LineChart from '@/components/LineChart.vue';
import { monitorStore } from '@/stores';
import { fmt, colorFor, lastOf } from '@/utils/format';

const online = computed(() => monitorStore.data?.online === true);

// 历史趋势：把双向指标（磁盘 IO 读/写、网络 收/发）合并为单条总吞吐线
function combineSeries(a = [], b = []) {
  const n = Math.max(a.length, b.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i];
    if (x != null && y != null) out.push(x + y);
    else if (x != null) out.push(x);
    else if (y != null) out.push(y);
    else out.push(null);
  }
  return out;
}

const series = computed(() => monitorStore.data?.series || {});
const diskIoValues = computed(() => combineSeries(series.value.io?.read, series.value.io?.write));
const netValues = computed(() => combineSeries(series.value.network?.up, series.value.network?.down));
const diskIoCur = computed(() => { const x = lastOf(diskIoValues.value); return x != null ? x : 0; });
const netCur = computed(() => { const x = lastOf(netValues.value); return x != null ? x : 0; });
</script>
