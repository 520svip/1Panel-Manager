<template>
  <div>
    <div class="monitor-head">
      <div class="title">
        <button class="btn btn-sm btn-ghost" @click="back">← 返回</button>
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
