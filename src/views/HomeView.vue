<template>
  <div>
    <div class="list-toolbar">
      <div class="toolbar-row">
        <input class="search-input" v-model="panelsStore.search" placeholder="搜索名称 / IP / 备注 / 分类" />
        <span class="count">共 {{ panelsStore.list.length }} 个</span>
        <span class="result-count" v-if="filteredPanels.length !== panelsStore.list.length">命中 {{ filteredPanels.length }}</span>
        <button class="filter-toggle" :class="{ open: showFilters }" :title="showFilters ? '收起筛选' : '展开筛选'" @click="showFilters = !showFilters">
          <span class="icon" v-html="icChevron"></span>
        </button>
      </div>

      <transition name="fade-slide">
        <div v-if="showFilters" class="filter-bar">
          <div class="filter-group">
            <span class="filter-label">版本</span>
            <button class="chip" :class="{ active: panelsStore.activeVersion === 'all' }" @click="setVersion('all')">全部</button>
            <button class="chip" :class="{ active: panelsStore.activeVersion === 'v1' }" @click="setVersion('v1')">V1</button>
            <button class="chip" :class="{ active: panelsStore.activeVersion === 'v2' }" @click="setVersion('v2')">V2</button>
          </div>
          <div class="filter-group">
            <span class="filter-label">状态</span>
            <button class="chip" :class="{ active: panelsStore.activeStatus === 'all' }" @click="setStatus('all')">全部</button>
            <button class="chip chip-online" :class="{ active: panelsStore.activeStatus === 'online' }" @click="setStatus('online')"><i class="dot"></i>在线</button>
            <button class="chip chip-offline" :class="{ active: panelsStore.activeStatus === 'offline' }" @click="setStatus('offline')"><i class="dot"></i>离线</button>
          </div>
          <div class="filter-group">
            <span class="filter-label">分类</span>
            <button class="chip" :class="{ active: panelsStore.activeCategory === 'all' }" @click="setCategory('all')">全部</button>
            <button v-for="c in categories" :key="c" class="chip" :class="{ active: panelsStore.activeCategory === c }" @click="setCategory(c)">{{ c }}</button>
          </div>
        </div>
      </transition>

      <div class="toolbar-row toolbar-actions">
        <label class="ctrl-label">
          <span class="switch">
            <input type="checkbox" v-model="panelsStore.autoRefresh" @change="saveUiSettings" />
            <span class="slider"></span>
          </span>
          自动刷新
        </label>
        <label class="ctrl-label">
          间隔
          <input type="number" min="1" v-model.number="panelsStore.interval" :disabled="!panelsStore.autoRefresh" @change="saveUiSettings" /> 秒
        </label>
        <button class="btn btn-sm" :disabled="panelsStore.loading" @click="refreshAll(false)">刷新全部</button>
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
            <span class="addr">{{ p.protocol }}://{{ p.host }}:{{ p.port }}{{ panelEntry(p.entry) }}</span>
          </div>
          <span class="badge" :class="p._online === true ? 'online' : (p._online === false ? 'offline' : 'unknown')">
            <span class="dot"></span>{{ p._online === true ? '在线' : (p._online === false ? '离线' : '检测中') }}
          </span>
          <span class="badge version">{{ p.version.toUpperCase() }}</span>
          <span v-if="p.category" class="badge category">{{ p.category }}</span>
        </div>

        <div v-if="p._error" class="error-msg">{{ p._error }}</div>

        <div v-if="p._noData" class="error-msg" :title="p._noDataHint">
          该面板在线但 CPU/内存/磁盘数据未获取到（请到 1Panel 「监控」页面启用监控）
        </div>

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
            <button class="btn btn-sm" @click="restartPanel(p)" title="重启面板">重启面板</button>
            <button class="btn btn-sm btn-danger" @click="rebootPanel(p)" title="重启所在系统">重启系统</button>
          </div>
          <div class="action-row action-manage">
            <button class="btn btn-sm" :disabled="p._refreshing" @click="refreshPanel(p.id)">刷新</button>
            <button class="btn btn-sm" :disabled="appExpose?.isTest" @click="editPanel(p)">编辑</button>
            <button class="btn btn-sm btn-danger" :disabled="appExpose?.isTest" @click="deletePanel(p)">删除</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, watch, inject } from 'vue';
import { useRouter } from 'vue-router';
import ProgressBar from '@/components/ProgressBar.vue';
import icChevron from '@/assets/icons/chevron-down.svg?raw';
import { panelsStore, monitorStore } from '@/stores';
import {
  loadPanels, refreshPanel, refreshAll, openPanel, restartPanel, rebootPanel, deletePanel,
  panelEntry, diskUsedPercent, saveUiSettings,
} from '@/stores/actions';
import { fetchMonitor } from '@/stores/actions';
import { fmt, colorFor } from '@/utils/format';
import { getToken } from '@/api';

const router = useRouter();
const appExpose = inject('appExpose', null);
// 折叠状态持久化：无缓存默认展开；之前折叠则保持折叠
const showFilters = ref(localStorage.getItem('home.showFilters') !== 'false');
watch(showFilters, (v) => localStorage.setItem('home.showFilters', v ? 'true' : 'false'));

const emptyList = computed(() => panelsStore.list.length === 0 && !panelsStore.loading);
const categories = computed(() => {
  const set = new Set();
  panelsStore.list.forEach((p) => { const c = (p.category || '').trim(); if (c) set.add(c); });
  return Array.from(set);
});
const filteredPanels = computed(() => {
  let list = panelsStore.list;
  if (panelsStore.activeVersion !== 'all') {
    list = list.filter((p) => String(p.version || '').toLowerCase() === panelsStore.activeVersion);
  }
  if (panelsStore.activeStatus === 'online') {
    list = list.filter((p) => p._online === true);
  } else if (panelsStore.activeStatus === 'offline') {
    list = list.filter((p) => p._online === false);
  }
  if (panelsStore.activeCategory !== 'all') {
    list = list.filter((p) => (p.category || '').trim() === panelsStore.activeCategory);
  }
  const q = panelsStore.search.trim().toLowerCase();
  if (q) {
    list = list.filter((p) =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.host || '').toLowerCase().includes(q) ||
      (p._base?.ipV4Addr || p._base?.ipv4Addr || '').toLowerCase().includes(q) ||
      (p.remark || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q)
    );
  }
  return list;
});
const noFilterResult = computed(() => panelsStore.list.length > 0 && filteredPanels.value.length === 0);

function setCategory(c) { panelsStore.activeCategory = c; }
function setVersion(v) { panelsStore.activeVersion = v; }
function setStatus(s) { panelsStore.activeStatus = s; }

function editPanel(p) {
  appExpose?.openEditPanel(p);
}

function gotoMonitor(id) {
  monitorStore.id = id;
  monitorStore.data = null;
  monitorStore.stats = null;
  monitorStore.apps = [];
  monitorStore.activeTab = 'home';
  router.push('/dashboard/' + id);
  fetchMonitor();
}

let listTimer = null;
function stopListRefresh() { if (listTimer) { clearTimeout(listTimer); listTimer = null; } }
function scheduleListRefresh() {
  stopListRefresh();
  const loggedIn = !!getToken();
  if (!(loggedIn && panelsStore.list.length > 0 && panelsStore.autoRefresh)) return;
  listTimer = setTimeout(async () => {
    listTimer = null;
    await refreshAll(true);
    scheduleListRefresh();
  }, Math.max(1, panelsStore.interval) * 1000);
}

watch(() => [panelsStore.list.length, panelsStore.autoRefresh, panelsStore.interval], scheduleListRefresh);

onMounted(() => {
  if (panelsStore.list.length === 0) loadPanels();
  scheduleListRefresh();
});
onUnmounted(stopListRefresh);
</script>

<style scoped>
/* ---------- 列表工具栏 / 筛选 ---------- */
.list-toolbar {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-bottom: 16px;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.toolbar-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.toolbar-actions { justify-content: flex-end; border-top: 1px dashed var(--border); padding-top: 10px; margin-top: 2px; }

.search-input {
  flex: 1; min-width: 0;
  padding: 9px 12px; border: 1px solid var(--border); border-radius: 9px;
  font-size: 13px; background: #fbfcfe; color: var(--text);
  transition: border-color .15s, box-shadow .15s;
}
.search-input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(59,130,246,.12); background: #fff; }

.result-count {
  font-size: 12px; color: var(--primary); background: #eff6ff;
  padding: 3px 10px; border-radius: 999px; flex-shrink: 0;
}
.filter-toggle {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; padding: 0;
  border: 1px solid var(--border); border-radius: 8px;
  background: #fff; color: var(--muted);
  cursor: pointer; flex-shrink: 0;
  transition: all .15s;
}
.filter-toggle:hover { color: var(--primary); border-color: var(--primary); }
/* 内嵌图标显式居中，避免 SVG 沿文字基线偏移 */
.filter-toggle .icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  line-height: 0;
  flex-shrink: 0;
}
.filter-toggle .icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
  transition: transform .2s;
}
.filter-toggle.open .icon :deep(svg) { transform: rotate(180deg); }
.fade-slide-enter-active, .fade-slide-leave-active { transition: opacity .15s ease, transform .15s ease; }
.fade-slide-enter-from, .fade-slide-leave-to { opacity: 0; transform: translateY(-6px); }

.ctrl-label { font-size: 13px; color: var(--muted); display: inline-flex; align-items: center; gap: 6px; }
.ctrl-label input[type="number"] { width: 56px; padding: 5px 8px; border: 1px solid var(--border); border-radius: 7px; font-size: 13px; }

.filter-bar { display: flex; flex-direction: column; gap: 10px; padding: 10px 0; border-top: 1px dashed var(--border); border-bottom: 1px dashed var(--border); }
.filter-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.filter-label { font-size: 12px; color: var(--muted); min-width: 32px; flex-shrink: 0; }

.chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 12px; border-radius: 999px; border: 1px solid var(--border);
  background: #fff; color: #3a4256; font-size: 12px; cursor: pointer; transition: all .15s;
  white-space: nowrap;
}
.chip:hover { border-color: #cbd2df; }
.chip.active { background: var(--primary); border-color: var(--primary); color: #fff; }
.chip .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.chip-online .dot { background: var(--green); }
.chip-offline .dot { background: var(--red); }
.chip.active .dot { background: #fff; }

/* ---------- 面板卡片网格 ---------- */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
}
.panel-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: transform .15s, box-shadow .15s;
}
.panel-card:hover { box-shadow: var(--shadow-lg); transform: translateY(-2px); }
.panel-card.offline { opacity: .75; }

.card-head { display: flex; align-items: flex-start; gap: 10px; }
.card-head .name { font-size: 16px; font-weight: 700; flex: 1; line-height: 1.3; }
.card-head .name .addr { display: block; font-size: 12px; font-weight: 400; color: var(--muted); margin-top: 2px; word-break: break-all; }

.badge.version { background: #eef2ff; color: #4f46e5; }
.badge.category { background: #f3e8ff; color: #7c3aed; }

.occupancy { display: flex; flex-direction: column; gap: 8px; }
.metric { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.metric .label { width: 30px; color: var(--muted); flex-shrink: 0; }
.metric .val { width: 48px; text-align: right; color: var(--text); font-variant-numeric: tabular-nums; flex-shrink: 0; }

.card-actions { display: flex; flex-direction: column; gap: 8px; margin-top: auto; }
.card-actions .action-row {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.card-actions .action-manage { grid-template-columns: 1fr 1fr 1fr; }
.card-actions .action-row .btn { min-width: 0; padding: 6px 8px; justify-content: center; }
.card-actions .action-row .btn:disabled { opacity: .5; }

@media (max-width: 640px) {
  .grid { grid-template-columns: 1fr; }
  .card-actions .action-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .card-actions .action-manage { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .toolbar-actions { justify-content: stretch; flex-wrap: wrap; }
  .toolbar-actions .btn { margin-left: auto; }
  .filter-label { min-width: 28px; }
}
@media (max-width: 420px) {
  .list-toolbar { padding: 12px; }
  .chip { padding: 5px 10px; font-size: 11.5px; }
  .filter-group { gap: 6px; }
}
</style>
