# 1Panel Manager

一个基于 **Node.js + Vue 3 + SQLite** 的 [1Panel](https://github.com/1Panel-dev/1Panel) 面板集中管理工具。通过一个页面记录并管理多台 1Panel 面板，支持资源监控、批量状态查看与快捷跳转，手机端也能良好适配。

---

## 1. 前言

 本项目是由于某个靓仔老是忘记面板地址，又因不是专业版，APP不能统一管理，在闲暇时间开发的，所以代码大部分靠AI生成，没有做过多的优化，仅供参考。不确保后续是否会继续维护，主要是Token不够用了（强烈谴责程总不借我点不用还的Token），如果有需要，可以自行fork。

## 2. 功能特性

- **多面板集中管理**：记录每台面板的「名称、协议、地址、端口、安全入口、面板版本（V1/V2）、接口密钥、备注、分类」。
- **一键打开面板**：以 `window.open` 在新标签页打开 1Panel 真实地址，规避跨站 iframe 的 Cookie 限制。
- **实时资源监控**：接入 1Panel API，在首页卡片直接查看 CPU / 内存 / 磁盘占用。
- **监控详情页**：查看主机信息、CPU / 内存 / 负载 / 网络、磁盘分区、最近 30 分钟历史趋势图。
- **在线状态检测**：实时展示每台面板的在线 / 离线状态。
- **分类管理**：为机器设置分类，支持按分类快速筛选。
- **搜索**：按名称 / IP / 备注 / 分类模糊搜索。
- **组合筛选**：按「版本（V1/V2）」「状态（在线/离线）」「分类」多维度组合过滤。
- **自动刷新**：首页列表与监控页均支持自动刷新，开关与间隔秒数可配置，并持久化到数据库。
- **电源操作**：重启面板（`restart/1panel`）、重启所在系统（`restart/system`）。
- **后台登录鉴权**：访问需密码，未登录无法查看/操作任何面板；支持修改密码。
- **并发保护**：批量刷新采用并发限流 + 链式调度，大量机器也不会造成请求风暴或堆积。
- **移动端自适应**。

---

## 3. 环境要求

- **Node.js >= 22.5.0**（使用内置的 `node:sqlite`，无需编译原生模块）
- 无需安装数据库，数据保存在 `data/panels.db`

---

## 4. 安装与运行

```bash
# 安装依赖（仅有 express）
npm install

# 启动服务
npm start

# 开发模式（文件改动自动重启）
npm run dev
```

启动后访问：<http://localhost:3000>

### 环境变量配置

项目根目录下的 `.env` 文件（可参考 `.env.example` 创建）用于配置服务：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 服务监听端口 |
| `HOST` | `0.0.0.0` | 监听地址（仅本机访问可设 `127.0.0.1`） |
| `DEFAULT_PASSWORD` | `admin123` | 首次启动时初始化的后台密码 |
| `SESSION_TTL_HOURS` | `24` | 后台会话有效期（小时） |
| `PANEL_TIMEOUT_MS` | `8000` | 请求 1Panel API 的超时（毫秒） |

> 配置优先级：**命令行环境变量 > `.env` 文件 > 默认值**。例如 `PORT=8080 npm start` 会覆盖 `.env` 中的 `PORT`。
>
> 使用 Node.js 内置的 `process.loadEnvFile` 加载，无需额外安装 dotenv。

**默认后台密码：`admin123`**（仅当数据库首次初始化时生效，之后请在「设置」中修改）。

---

## 5. 使用说明

1. 打开页面，输入后台密码登录。
2. 点击右上角「添加面板」，填写：
   - **名称**（必填）、**主机地址**（必填）
   - **协议**（http / https）、**端口**（默认 8888）、**安全入口**（可空，无需填 `/`，自动补全）
   - **面板版本**（V1 / V2）、**接口密钥**（1Panel API Key）、**分类**、**备注**
3. 保存后，面板卡片会展示：
   - **名称 / 地址 / 版本 / 分类**徽标
   - **状态**：在线 / 离线（自动检测）
   - **占用**：CPU / 内存 / 磁盘
4. 卡片操作按钮：
   - **打开面板**：新标签页打开该面板真实地址
   - **监控**：进入详情页查看完整资源监控
   - **刷新**：单台刷新在线状态与占用
   - **重启**：重启面板（需正确接口密钥）
   - **重启系统**：重启所在服务器系统（危险操作，二次确认）
   - **编辑 / 删除**：管理面板配置
5. 首页顶部工具栏：
   - **搜索框**：按名称 / IP / 备注 / 分类搜索
   - **筛选**：按版本、状态、分类组合过滤
   - **自动刷新**：开关 + 间隔秒数（默认 5 秒），自动保存到数据库
6. 监控详情页：
   - 查看主机信息、实时指标、磁盘、历史趋势
   - **自动刷新**：开关 + 间隔秒数（默认 3 秒），自动保存
   - 按 F5 刷新页面后，会通过 URL hash 自动恢复当前监控视图
7. 右上角「设置」修改后台密码，「退出」销毁会话。

---

## 6.界面预览

<table>
  <tr>
    <td align="center" width="33%"><img src="docs/images/home.png" alt="首页"><br>首页（面板列表）</td>
    <td align="center" width="33%"><img src="docs/images/monitor.png" alt="监控详情"><br>监控详情</td>
    <td align="center" width="33%"><img src="docs/images/addPanel.png" alt="添加面板"><br>添加面板</td>
  </tr>
</table>

---

## 7. 项目结构

```
1PanelManager/
├── start.js                  # 启动入口（加载 .env、自动处理 node:sqlite 实验标志）
├── server.js                 # Express 后端服务与路由
├── package.json
├── .env                      # 环境配置（端口、密码、超时等，已加入 .gitignore）
├── .env.example              # 环境配置模板
├── .gitignore
├── lib/
│   ├── db.js                 # SQLite 数据访问（node:sqlite，零编译依赖）
│   ├── auth.js               # 后台登录鉴权与会话管理
│   └── panelApi.js           # 1Panel API 客户端（V1/V2 签名、请求、超时）
├── public/
│   ├── index.html            # 前端入口
│   ├── app.js                # Vue 3 单页应用
│   ├── style.css             # 样式
│   └── vendor/
│       └── vue.global.prod.js  # 本地 Vue 3（无 CDN 依赖）
├── docs/
│   ├── 1PanelApiDoc/         # 1Panel API 接口文档（v1doc.json / v2doc.json）
│   └── images/               # README 界面截图
└── data/                     # 运行时生成（panels.db，已加入 .gitignore）
```

---

## 8. API 说明

本管理后台自身的接口。除登录/退出外，均需携带请求头 `Authorization: Bearer <token>`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | 后台登录，返回会话 token |
| POST | `/api/auth/logout` | 退出登录 |
| GET | `/api/auth/check` | 校验会话是否有效 |
| POST | `/api/settings/password` | 修改后台密码 |
| GET | `/api/settings/ui` | 读取 UI 设置（自动刷新开关 / 间隔） |
| POST | `/api/settings/ui` | 保存 UI 设置 |
| GET | `/api/panels` | 面板列表 |
| POST | `/api/panels` | 添加面板 |
| PUT | `/api/panels/:id` | 更新面板 |
| DELETE | `/api/panels/:id` | 删除面板配置 |
| POST | `/api/panels/:id/refresh` | 检测在线状态并拉取占用概要 |
| POST | `/api/panels/:id/restart` | 重启面板（1Panel API `restart/1panel`） |
| POST | `/api/panels/:id/reboot` | 重启所在系统（1Panel API `restart/system`） |
| GET | `/api/panels/:id/monitor` | 监控详情（主机信息 + 实时占用 + 历史趋势） |

---

## 9. 1Panel API 鉴权说明

1Panel 接口通过两个请求头鉴权：

| Header | 说明 |
| --- | --- |
| `1Panel-Token` | 签名令牌 |
| `1Panel-Timestamp` | 当前 Unix 时间戳（秒） |

签名生成方式（本工具已封装，无需手动处理）：

- **V1**：`1Panel-Token` 直接为 API Key。
- **V2**（推荐）：`1Panel-Token = HMAC-SHA256(API-Key, "1panel:" + timestamp)`。

> 详情见 1Panel 官方文档：[V1](https://1panel.cn/docs/v1/dev_manual/api_manual/) / [V2](https://1panel.cn/docs/v2/dev_manual/api_manual/)。

---

## 10. 注意事项

- **打开面板方式**：使用 `window.open` 打开真实地址，不使用 iframe，因此不存在跨站 iframe 的 Cookie 拦截问题（iframe 方案下 1Panel 返回 `401 ErrAuth` 即源于第三方 Cookie 限制）。
- **历史趋势需面板开启监控**：若监控页历史趋势无数据，请先在该 1Panel 面板的「监控」页面开启监控开关。本工具请求时间已按 1Panel 要求的 RFC3339 格式处理。
- **接口密钥权限**：执行「重启 / 重启系统」等操作需 API Key 具备相应权限；密钥错误或未授权时操作会失败。
- **并发与刷新策略**：
  - 批量刷新最多同时并发 5 台，避免连接风暴。
  - 对外请求超时 8 秒，离线机器快速失败不拖慢整体。
  - 定时刷新采用「上一轮结束后间隔 N 秒」的链式调度，不会因一轮耗时超过间隔而堆积请求。
- **数据位置**：所有面板配置与 UI 设置保存在 `data/panels.db`，备份该文件即可备份全部数据。

---


