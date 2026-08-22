<template>
  <div>
    <div class="monitor-head">
      <div class="title">
        <button class="btn-back" @click="back"><span class="icon" v-html="icBack"></span>返回</button>
        <span>{{ currentMonitorName }}</span>
        <span class="badge" :class="monOnline ? 'online' : 'offline'">
          <span class="dot"></span>{{ monOnline ? '在线' : '离线' }}
        </span>
      </div>
      <div class="controls" v-if="!monError">
        <label>
          <span class="switch">
            <input type="checkbox" v-model="monitorStore.autoRefresh" @change="saveUiSettings" />
            <span class="slider"></span>
          </span>
          自动刷新
        </label>
        <label>
          间隔
          <input type="number" min="1" v-model.number="monitorStore.interval" :disabled="!monitorStore.autoRefresh" @change="saveUiSettings" /> 秒
        </label>
        <button class="btn btn-sm" :disabled="monitorStore.loading" @click="fetchMonitor">立即刷新</button>
      </div>
    </div>

    <div v-if="monError" class="empty" style="padding:60px 20px">
      <div class="icon">🔌</div>
      <h3>无法连接该面板</h3>
      <p>{{ monError }}</p>
    </div>

    <template v-else>
      <div class="tabs">
        <button class="tab" :class="{ active: monitorStore.activeTab === 'home' }" @click="switchTab('home')">首页</button>
        <button class="tab" :class="{ active: monitorStore.activeTab === 'apps' }" @click="switchTab('apps')">应用</button>
        <button class="tab" :class="{ active: monitorStore.activeTab === 'containers' }" @click="switchTab('containers')">容器</button>
      </div>

      <HomeTab v-if="monitorStore.activeTab === 'home'" />
      <AppsTab v-if="monitorStore.activeTab === 'apps'" />
      <ContainersTab v-if="monitorStore.activeTab === 'containers'" />
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import HomeTab from './dashboard/HomeTab.vue';
import AppsTab from './dashboard/AppsTab.vue';
import ContainersTab from './dashboard/ContainersTab.vue';
import { monitorStore, panelsStore } from '@/stores';
import icBack from '@/assets/icons/chevron-left.svg?raw';
import {
  fetchMonitor, fetchApps, fetchContainerStats, fetchDockerStatus, fetchContainers, saveUiSettings,
} from '@/stores/actions';

const router = useRouter();

const props = defineProps({ id: { type: [String, Number], default: null } });

const monOnline = computed(() => monitorStore.data?.online === true);
const monError = computed(() => monitorStore.data?.error || monitorStore.error || null);
const currentMonitorName = computed(() => {
  const p = panelsStore.list.find((x) => x.id === monitorStore.id);
  return p ? p.name : '';
});

function back() {
  router.push('/');
}

function switchTab(tab) {
  monitorStore.activeTab = tab;
  if (tab === 'home') fetchMonitor();
  else if (tab === 'apps') fetchApps();
  else if (tab === 'containers') { fetchDockerStatus(); fetchContainers(); }
}

let monitorTimer = null;
function startMonitorRefresh() {
  stopMonitorRefresh();
  if (monitorStore.autoRefresh) {
    monitorTimer = setInterval(() => {
      if (monitorStore.activeTab === 'home') fetchMonitor();
      else if (monitorStore.activeTab === 'containers') fetchContainerStats();
    }, Math.max(1, monitorStore.interval) * 1000);
  }
}
function stopMonitorRefresh() {
  if (monitorTimer) { clearInterval(monitorTimer); monitorTimer = null; }
}

watch(() => monitorStore.interval, startMonitorRefresh);
watch(() => monitorStore.autoRefresh, startMonitorRefresh);

onMounted(() => {
  const id = Number(props.id);
  monitorStore.id = id;
  monitorStore.data = null;
  monitorStore.stats = null;
  monitorStore.apps = [];
  monitorStore.containers = [];
  monitorStore.containerSelected = {};
  monitorStore.containerSearch = '';
  monitorStore.containerState = 'all';
  monitorStore.appSearch = '';
  monitorStore.appState = 'all';
  monitorStore.dockerStatus = null;
  monitorStore.images = [];
  monitorStore.showImages = false;
  monitorStore.activeTab = 'home';
  monitorStore.error = null;
  fetchMonitor();
  startMonitorRefresh();
});
onUnmounted(stopMonitorRefresh);
</script>

<style scoped>
/* ---------- 监控页头部 ---------- */
.monitor-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.monitor-head .title { font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 10px; margin-right: auto; }
.monitor-head .title .btn-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: #fff;
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition: all .15s;
}
.monitor-head .title .btn-back:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 8%, #fff);
}
.monitor-head .title .btn-back .icon {
  display: inline-flex;
  width: 14px;
  height: 14px;
  color: inherit;
  transition: transform .15s;
}
.monitor-head .title .btn-back .icon :deep(svg) {
  width: 100%;
  height: 100%;
}
.monitor-head .title .btn-back:hover .icon { transform: translateX(-2px); }

.controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.controls label { font-size: 13px; color: var(--muted); display: inline-flex; align-items: center; gap: 5px; }
.controls input[type="number"] {
  width: 56px; padding: 5px 8px; border: 1px solid var(--border); border-radius: 7px; font-size: 13px;
}

/* ---------- 页签导航 ---------- */
.tabs {
  display: flex;
  gap: 0;
  margin-bottom: 16px;
  border-bottom: 2px solid var(--border);
}
.tab {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  color: var(--muted);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  cursor: pointer;
  transition: all .15s;
  font-family: inherit;
}
.tab:hover { color: var(--text); }
.tab.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}
</style>
