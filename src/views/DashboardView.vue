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

      <!-- ===== 首页 Tab ===== -->
      <div v-if="monitorStore.activeTab === 'home'">
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

        <div v-if="monOnline">
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

      <!-- ===== 应用 Tab ===== -->
      <div v-if="monitorStore.activeTab === 'apps'">
        <div class="section">
          <div class="app-toolbar">
            <input class="app-search" v-model="monitorStore.appSearch" placeholder="搜索应用名称 / 端口 / 路径..." />
            <div class="app-toolbar-actions">
              <span class="count">{{ filteredApps.length }} / {{ monitorStore.apps.length }}</span>
              <button class="btn btn-sm" :disabled="monitorStore.appsLoading" @click="fetchApps">刷新</button>
              <button class="btn btn-sm" @click="syncApps">同步</button>
            </div>
          </div>
          <div v-if="monitorStore.appsLoading" style="text-align:center;padding:40px;color:var(--muted)">加载中...</div>
          <div v-else-if="monitorStore.apps.length === 0" class="empty" style="padding:40px">
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
                    <button v-if="!appRunning(app) && !appTransient(app)" class="btn btn-sm" :disabled="monitorStore.appOps[app.id]" @click="operateApp(app, 'start')">启动</button>
                    <button v-if="(appRunning(app) || appSt(app) === 'unhealthy') && !appTransient(app)" class="btn btn-sm" :disabled="monitorStore.appOps[app.id]" @click="operateApp(app, 'stop')">停止</button>
                    <button v-if="!appTransient(app)" class="btn btn-sm" :disabled="monitorStore.appOps[app.id]" @click="operateApp(app, 'restart')">重启</button>
                    <button v-if="!appTransient(app)" class="btn btn-sm" :disabled="monitorStore.appOps[app.id]" @click="operateApp(app, 'rebuild')">重建</button>
                    <button v-if="app.canUpdate && !appTransient(app)" class="btn btn-sm" :disabled="monitorStore.appOps[app.id]" @click="openUpgrade(app)">升级</button>
                    <button v-if="!appTransient(app)" class="btn btn-sm btn-danger" :disabled="monitorStore.appOps[app.id]" @click="operateApp(app, 'uninstall')">卸载</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 容器 Tab ===== -->
      <div v-if="monitorStore.activeTab === 'containers'">
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
              <select class="state-select" v-model="monitorStore.containerState" @change="fetchContainers">
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
      </div>
    </template>

    <!-- 应用升级弹窗 -->
    <Modal v-if="monitorStore.upgradeApp" title="" @close="monitorStore.upgradeApp = null">
      <template #default>
        <h2>升级「{{ monitorStore.upgradeApp.name }}」</h2>
        <div class="field">
          <label>当前版本</label>
          <div class="upgrade-current">v{{ monitorStore.upgradeApp.version }}</div>
        </div>
        <div class="field">
          <label>选择目标版本</label>
          <div v-if="monitorStore.upgradeLoading" style="text-align:center;padding:20px;color:var(--muted)">加载中...</div>
          <div v-else-if="monitorStore.upgradeVersions.length === 0" class="error-msg">暂无可用升级版本</div>
          <select v-else class="upgrade-select" v-model.number="monitorStore.upgradeIndex">
            <option v-for="(ver, i) in monitorStore.upgradeVersions" :key="ver.detailId || i" :value="i">
              {{ ver.version }}{{ i === 0 ? '（最新）' : '' }}
            </option>
          </select>
        </div>
        <div class="field">
          <label class="checkbox-label">
            <input type="checkbox" v-model="monitorStore.upgradeOpts.backup" />
            <span>升级前备份应用</span>
          </label>
        </div>
        <div class="field">
          <label class="checkbox-label">
            <input type="checkbox" v-model="monitorStore.upgradeOpts.pullImage" />
            <span>拉取新版本镜像</span>
          </label>
        </div>
        <div class="field" v-if="!isV1Panel">
          <label class="checkbox-label">
            <input type="checkbox" v-model="monitorStore.upgradeOpts.deleteImage" />
            <span>升级完成后删除旧镜像</span>
          </label>
        </div>
      </template>
      <template #footer>
        <button class="btn" @click="monitorStore.upgradeApp = null">取消</button>
        <button class="btn btn-primary" :disabled="monitorStore.upgradeLoading || monitorStore.upgradeVersions.length === 0" @click="doUpgrade(monitorStore.upgradeApp, monitorStore.upgradeVersions[monitorStore.upgradeIndex])">
          确认升级
        </button>
      </template>
    </Modal>

    <!-- 卸载确认弹窗 -->
    <UninstallModal
      v-if="monitorStore.uninstallApp"
      :app="monitorStore.uninstallApp"
      :opts="monitorStore.uninstallOpts"
      :is-v1="isV1Panel"
      :busy="!!monitorStore.appOps[monitorStore.uninstallApp.id]"
      @cancel="monitorStore.uninstallApp = null"
      @confirm="doUninstall"
    />

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
import { computed, onMounted, onUnmounted, watch, inject } from 'vue';
import { useRouter } from 'vue-router';
import LineChart from '@/components/LineChart.vue';
import Modal from '@/components/Modal.vue';
import UninstallModal from '@/components/UninstallModal.vue';
import { monitorStore, panelsStore } from '@/stores';
import {
  fetchMonitor, fetchApps, operateApp, syncApps, openUpgrade, doUpgrade, doUninstall,
  fetchContainers, fetchContainerStats, operateContainers, saveUiSettings,
  fetchDockerStatus, operateDocker, pruneContainers, fetchImages, removeImages,
} from '@/stores/actions';
import { fmt, colorFor, appStatusText, appStatusClass, lastOf, containerStateText, containerStateClass, containerPortsText, containerCpuPercent, containerMemoryText, containerMemoryPercent } from '@/utils/format';
import { iconError } from '@/stores/actions';

const router = useRouter();
const appExpose = inject('appExpose', null);

const props = defineProps({ id: { type: [String, Number], default: null } });

const monOnline = computed(() => monitorStore.data?.online === true);
const monError = computed(() => monitorStore.data?.error || monitorStore.error || null);
const currentMonitorName = computed(() => {
  const p = panelsStore.list.find((x) => x.id === monitorStore.id);
  return p ? p.name : '';
});
const filteredApps = computed(() => {
  const q = (monitorStore.appSearch || '').trim().toLowerCase();
  if (!q) return monitorStore.apps;
  return monitorStore.apps.filter((a) =>
    (a.name || '').toLowerCase().includes(q) ||
    (a.appName || '').toLowerCase().includes(q) ||
    (a.path || '').toLowerCase().includes(q) ||
    String(a.httpPort || '').includes(q) ||
    String(a.httpsPort || '').includes(q)
  );
});
// 应用状态辅助：stable 稳定态 / transient 过渡态（任务执行中）
const transientAppStates = ['creating', 'installing', 'uninstalling', 'rebuilding', 'upgrading', 'restarting', 'stopping', 'starting', 'deleting'];
function appSt(app) { return (app.status || '').toLowerCase(); }
function appTransient(app) { return transientAppStates.includes(appSt(app)); }
function appRunning(app) { return appSt(app) === 'running'; }

const filteredContainers = computed(() => {
  const q = (monitorStore.containerSearch || '').trim().toLowerCase();
  if (!q) return monitorStore.containers;
  return monitorStore.containers.filter((c) =>
    (c.name || '').toLowerCase().includes(q) ||
    (c.imageName || c.image || '').toLowerCase().includes(q) ||
    String(c.id || '').toLowerCase().includes(q)
  );
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
const isV1Panel = computed(() => {
  const p = panelsStore.list.find((x) => x.id === monitorStore.id);
  return !!(p && p.version === 'v1');
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
