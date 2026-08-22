<template>
  <div>
    <div class="section">
      <!-- Docker 信息板块 -->
      <div class="docker-card">
        <div class="docker-info">
          <div class="docker-icon">🐳</div>
          <div>
            <div class="docker-name-row">
              <span class="docker-name">Docker</span>
              <span class="badge" :class="dockerStatusClass"><span class="dot"></span>{{ dockerStatusText }}</span>
            </div>
            <div class="docker-meta">容器 {{ monitorStore.containers.length }} 个</div>
          </div>
        </div>
        <div class="docker-actions">
          <button v-if="dockerExist && !dockerActive" class="btn btn-sm" :disabled="dockerOpsAny" @click="operateDocker('start')">启动 Docker</button>
          <template v-if="dockerExist && dockerActive">
            <button class="btn btn-sm" :disabled="dockerOpsAny" @click="operateDocker('stop')">停止 Docker</button>
            <button class="btn btn-sm" :disabled="dockerOpsAny" @click="operateDocker('restart')">重启 Docker</button>
            <button class="btn btn-sm" :disabled="dockerOpsAny" @click="pruneContainers('container')">清理容器</button>
            <button class="btn btn-sm" :disabled="dockerOpsAny" @click="pruneContainers('image')">清理镜像</button>
            <button class="btn btn-sm" :disabled="dockerOpsAny" @click="openImages">查看镜像</button>
          </template>
        </div>
      </div>

      <div class="app-toolbar">
        <input class="app-search" v-model="monitorStore.containerSearch" placeholder="搜索容器名称 / 镜像 / ID..." />
        <div class="app-toolbar-actions">
          <select class="state-select" v-model="monitorStore.containerState">
            <option value="all">全部状态</option>
            <option value="running">运行中</option>
            <option value="exited">已停止</option>
            <option value="paused">已暂停</option>
            <option value="created">已创建</option>
            <option value="dead">已失效</option>
            <option value="restarting">重启中</option>
            <option value="removing">删除中</option>
          </select>
          <span class="count">{{ filteredContainers.length }} / {{ monitorStore.containers.length }}</span>
          <button class="btn btn-sm" :disabled="monitorStore.containersLoading" @click="fetchContainers">刷新</button>
        </div>
      </div>

      <!-- 批量操作栏 -->
      <div v-if="selectedContainers.length" class="batch-bar">
        <span class="count">已选 {{ selectedContainers.length }} 个容器</span>
        <button class="btn btn-sm" :disabled="containerOpsAny" @click="operateContainers(selectedContainers, 'start')">启动</button>
        <button class="btn btn-sm" :disabled="containerOpsAny" @click="operateContainers(selectedContainers, 'stop')">停止</button>
        <button class="btn btn-sm" :disabled="containerOpsAny" @click="operateContainers(selectedContainers, 'restart')">重启</button>
        <button class="btn btn-sm btn-danger" :disabled="containerOpsAny" @click="operateContainers(selectedContainers, 'remove')">删除</button>
        <button class="btn btn-sm btn-ghost" @click="clearContainerSelection">取消选择</button>
      </div>

      <div v-if="monitorStore.containersLoading" style="text-align:center;padding:40px;color:var(--muted)">加载中...</div>
      <div v-else-if="monitorStore.containers.length === 0" class="empty" style="padding:40px">
        <div class="icon">🐳</div>
        <h3>暂无容器</h3>
        <p>当前筛选条件下没有容器</p>
      </div>
      <div v-else-if="filteredContainers.length === 0" class="empty" style="padding:40px">
        <div class="icon">🔍</div>
        <h3>没有匹配的容器</h3>
        <p>试试调整搜索关键词</p>
      </div>
      <div v-else class="app-list">
        <div
          v-for="c in filteredContainers"
          :key="c.id || c.name"
          class="app-card container-card"
          :class="{ selected: monitorStore.containerSelected[c.name] }"
          @click="toggleContainer(c)"
        >
          <input type="checkbox" class="container-check" :checked="!!monitorStore.containerSelected[c.name]" @click.stop="toggleContainer(c)" />
          <div class="container-main">
            <div class="app-name-row">
              <span class="app-name">{{ c.name }}</span>
              <span class="badge" :class="containerStateClass(c.state)"><span class="dot"></span>{{ containerStateText(c.state) }}</span>
            </div>
            <div class="container-meta">
              <span v-if="c.imageName || c.image" class="container-image" :title="c.imageName || c.image">📦 {{ c.imageName || c.image }}</span>
              <span v-if="c.runTime || c.status" class="container-status">{{ c.runTime || c.status }}</span>
              <span v-if="containerPortsText(c)" class="port-tag" :title="containerPortsText(c)">{{ containerPortsText(c) }}</span>
            </div>
            <div class="container-stats">
              <span class="stat-item" :style="{ color: cpuColor(c) }">CPU {{ cpuText(c) }}</span>
              <span class="stat-item" :style="{ color: memColor(c) }">内存 {{ containerMemoryText(c) }}</span>
            </div>
          </div>
          <div class="app-actions container-actions" @click.stop>
            <button class="btn btn-sm" :disabled="monitorStore.containerOps[c.name] || containerOpsAny" @click="operateContainers(c, 'start')" v-if="c.state !== 'running' && c.state !== 'paused'">启动</button>
            <button class="btn btn-sm" :disabled="monitorStore.containerOps[c.name] || containerOpsAny" @click="operateContainers(c, 'unpause')" v-if="c.state === 'paused'">恢复</button>
            <button class="btn btn-sm" :disabled="monitorStore.containerOps[c.name] || containerOpsAny" @click="operateContainers(c, 'stop')" v-if="c.state === 'running'">停止</button>
            <button class="btn btn-sm" :disabled="monitorStore.containerOps[c.name] || containerOpsAny" @click="operateContainers(c, 'restart')">重启</button>
            <button class="btn btn-sm btn-danger" :disabled="monitorStore.containerOps[c.name] || containerOpsAny" @click="operateContainers(c, 'remove')">删除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 镜像列表弹窗 -->
    <Modal v-if="monitorStore.showImages" title="镜像列表" @close="monitorStore.showImages = false">
      <template #default>
        <div class="image-toolbar">
          <span class="count">已选 {{ selectedImages.length }} / {{ monitorStore.images.length }} 个镜像</span>
          <button class="btn btn-sm btn-danger" :disabled="selectedImages.length === 0 || imageOpsAny" @click="removeImages(selectedImages)">删除所选</button>
        </div>
        <div v-if="monitorStore.imagesLoading" style="text-align:center;padding:30px;color:var(--muted)">加载中...</div>
        <div v-else-if="monitorStore.images.length === 0" class="empty" style="padding:30px">
          <div class="icon">🖼️</div>
          <h3>暂无镜像</h3>
          <p>当前面板下没有可用镜像</p>
        </div>
        <div v-else class="image-list">
          <div v-for="(im, i) in monitorStore.images" :key="im.id || im.imageId || i" class="image-row" :class="{ selected: monitorStore.imageSelected[im.id || im.imageId], disabled: im.isUsed }">
            <input type="checkbox" class="container-check" v-model="monitorStore.imageSelected[im.id || im.imageId]" :disabled="im.isUsed" :title="im.isUsed ? '使用中的镜像不可删除' : ''" />
            <div class="image-info">
              <div class="image-tags" :title="imageTags(im)">{{ imageTags(im) }}</div>
              <div class="image-meta">
                {{ fmt.bytes(im.size) }}
                <template v-if="im.createdAt"> · {{ fmt.clock(im.createdAt) }}</template>
                <template v-if="im.isUsed"> · <span class="used-tag">使用中</span></template>
              </div>
            </div>
            <button class="btn btn-sm btn-danger" :disabled="im.isUsed || monitorStore.imageOps[im.id || im.imageId]" @click="removeImages([im])">{{ im.isUsed ? '使用中' : '删除' }}</button>
          </div>
        </div>
      </template>
    </Modal>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Modal from '@/components/Modal.vue';
import { monitorStore } from '@/stores';
import {
  fetchContainers, operateContainers, fetchDockerStatus, operateDocker,
  pruneContainers, fetchImages, removeImages,
} from '@/stores/actions';
import {
  fmt, colorFor, containerStateText, containerStateClass, containerPortsText,
  containerCpuPercent, containerMemoryText, containerMemoryPercent,
} from '@/utils/format';

const filteredContainers = computed(() => {
  const st = monitorStore.containerState || 'all';
  const q = (monitorStore.containerSearch || '').trim().toLowerCase();
  return monitorStore.containers.filter((c) => {
    if (st !== 'all' && (c.state || '').toLowerCase() !== st) return false;
    if (!q) return true;
    return (c.name || '').toLowerCase().includes(q) ||
      (c.imageName || c.image || '').toLowerCase().includes(q) ||
      String(c.id || '').toLowerCase().includes(q);
  });
});
const selectedContainers = computed(() =>
  monitorStore.containers.filter((c) => monitorStore.containerSelected[c.name])
);
const containerOpsAny = computed(() => Object.values(monitorStore.containerOps).some(Boolean));

// Docker 服务
const dockerExist = computed(() => !!monitorStore.dockerStatus?.isExist);
const dockerActive = computed(() => !!monitorStore.dockerStatus?.isActive);
const dockerStatusText = computed(() => {
  if (!monitorStore.dockerStatus) return '未知';
  if (!dockerExist.value) return '未安装';
  return dockerActive.value ? '运行中' : '已停止';
});
const dockerStatusClass = computed(() => {
  if (!dockerExist.value) return 'offline';
  return dockerActive.value ? 'online' : 'warning';
});
const dockerOpsAny = computed(() => Object.values(monitorStore.dockerOps).some(Boolean) || Object.values(monitorStore.pruneOps).some(Boolean));

// 容器 CPU / 内存展示
function cpuText(c) {
  return fmt.cpuPct(containerCpuPercent(c));
}
function cpuColor(c) {
  return colorFor(containerCpuPercent(c));
}
function memColor(c) {
  return colorFor(containerMemoryPercent(c));
}

// 镜像
const selectedImages = computed(() => monitorStore.images.filter((im) => !im.isUsed && monitorStore.imageSelected[im.id || im.imageId]));
const imageOpsAny = computed(() => Object.values(monitorStore.imageOps).some(Boolean));
function imageTags(im) {
  const t = im.tags;
  if (Array.isArray(t) && t.length) return t.join(', ');
  if (typeof t === 'string' && t) return t;
  const id = im.id || im.imageId || '';
  return id ? `${String(id).slice(0, 19)}…` : '未命名镜像';
}
function openImages() {
  monitorStore.showImages = true;
  fetchImages();
}

function toggleContainer(c) {
  monitorStore.containerSelected[c.name] = !monitorStore.containerSelected[c.name];
}
function clearContainerSelection() {
  monitorStore.containerSelected = {};
}
</script>

<style scoped>
@import './shared.css';

/* ---------- 批量操作栏 ---------- */
.batch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 14px;
  margin-bottom: 12px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
}
.batch-bar .count { color: #1d4ed8; font-weight: 600; }

/* ---------- Docker 信息板块 ---------- */
.docker-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 14px 18px;
  margin-bottom: 14px;
  background: linear-gradient(135deg, #f8fafc, #eef2ff);
  border: 1px solid #e0e7ff;
  border-radius: 14px;
}
.docker-info { display: flex; align-items: center; gap: 12px; }
.docker-icon {
  width: 44px; height: 44px;
  border-radius: 12px;
  background: #e0e7ff;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
}
.docker-name-row { display: flex; align-items: center; gap: 8px; }
.docker-name { font-size: 16px; font-weight: 700; }
.docker-meta { font-size: 12px; color: var(--muted); margin-top: 3px; }
.docker-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* ---------- 容器卡片 ---------- */
.container-card { cursor: pointer; display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.container-card:hover { border-color: #cbd2df; }
.container-card.selected {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, .18), var(--shadow);
  background: #f5f9ff;
}
.container-check {
  width: 16px; height: 16px;
  flex-shrink: 0;
  cursor: pointer;
  accent-color: var(--primary);
  align-self: center;
}
.container-main { flex: 1; min-width: 0; }
.container-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 5px;
}
.container-image {
  font-size: 12px;
  color: var(--muted);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 260px;
}
.container-status { font-size: 12px; color: var(--muted); }
.container-stats {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 7px;
  font-size: 12px;
  color: var(--text);
}
.stat-item { font-weight: 600; }
.container-actions {
  width: 100%;
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
}
.badge.warning { background: #fffbeb; color: #d97706; }
.badge.warning .dot { background: var(--orange); }

/* ---------- 镜像列表弹窗 ---------- */
.image-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.image-list {
  max-height: 60vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.image-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.image-row.selected {
  border-color: var(--primary);
  background: #f5f9ff;
}
.image-row.disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: var(--bg-muted, #f5f5f5);
}
.image-info { flex: 1; min-width: 0; }
.image-tags {
  font-weight: 600;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.image-meta { font-size: 12px; color: var(--muted); margin-top: 2px; }
.used-tag { color: #16a34a; font-weight: 600; }

@media (max-width: 640px) {
  .app-card.container-card { display: flex; align-items: center; flex-wrap: wrap; }
}
</style>
