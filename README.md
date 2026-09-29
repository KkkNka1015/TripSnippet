# TripSnippet —— 本地旅行素材收藏与打包平台

> 专为旅行者设计的**本地私有化**旅行素材收集管理工具。
> 攻略、图片、音频分散在各个网站？TripSnippet 帮你抓取、整理、排序，一键打包成标准化 ZIP 素材包。
> 所有素材**仅存储在本机浏览器 IndexedDB，不上云、不上传任何用户数据**。

- 在线演示：https://tripsnippet.knklab.online
- 后端服务：（部署后填写 Render 地址）

## 功能演示说明

| 模块 | 功能点 |
| --- | --- |
| 素材导入 | 剪贴板粘贴导入（自动识别纯文本 / 图片 / 图文混合，导入前可预览删减）；URL 网页解析（后端代理抓取，自动剔除广告、导航、侧边栏，仅提取正文与配图，配图逐张勾选、支持全选/取消，仅勾选者入库）；本地文件导入（严格校验图片 / mp3 / 文本，拦截非法格式与超大文件）；在线录音（MediaRecorder 语音速记，懒得打字时随口一录，webm 格式浏览器直连播放，最长 10 分钟） |
| 解析体验 | 四阶段 Loading 提示（请求网页 → 提取正文 → 提取图片 → 即将完成）；请求超时自动终止并降级为手动粘贴；同 URL 短时缓存防重复抓取；SPA / 登录页 / 防盗链页面友好降级提示 |
| 素材管理 | 文本 / 图片 / 音频三类素材；弹窗预览、编辑、删除（10 秒内可撤销恢复，项目删除同样可撤销，含全部素材）；图片大图查看（全屏灯箱展示原图，左右键 / 按钮切换同项目图片，Esc 关闭）；拖拽自定义排序 + 行尾上移 / 下移按钮（触屏与键盘用户也能调序）；项目内按类型 / 标签筛选；全局统一标签池（素材支持多标签，池内展示使用计数，支持行内重命名、同名自动合并）；全局搜索（项目名 / 素材标题 / 备注 / 标签，流式扫描命中仅载轻量字段、不整表载入内存） |
| 行程时间轴 | 素材编辑弹窗可选填「行程时间」（如 `Day2 下午`，实时识别反馈）；导出笔记时自动排入按天/时段分组的时间轴，未填字段时回退识别备注中的 Day 标记 |
| 项目组织 | 项目置顶（排在画廊最前）、归档（收纳进首页「已归档」分区，可随时恢复） |
| 快捷导入 | 在项目页把图片 / mp3 / 文本文件直接拖进窗口即可导入，自动校验类型与大小；键盘快捷键：`/` 聚焦搜索、`N` 新建项目、`Ctrl+V` 直达剪贴板导入（输入框内按键不劫持，保持正常打字粘贴） |
| 批量操作 | 批量移动素材至其他项目、批量添加标签、批量删除（10 秒内可整批撤销恢复） |
| 快速上手 | 空状态一键「先看看示例项目」：自动生成京都五日示例（行程、攻略、canvas 程序化绘制的复古明信片、清单），可正常编辑与删除 |
| 打包导出 | 两种格式：ZIP 素材包（固定标准目录 `{项目名称}/旅行汇总笔记.md + images/ + audio/`，录音 webm 自动按实际格式命名）与单文件 Markdown（图片 base64 内嵌，任何阅读器直接打开，音频不含）；全部素材一键打包 / 勾选素材自定义打包；笔记按拖拽排序生成序号，自动汇总文案、备注、来源链接、行程时间；可选原图 / 压缩图、完整版 / 精简版笔记；导出前展示总大小统计（单文件 MD 含 base64 膨胀估算）；文件名自动清洗特殊字符 |
| 标签管理 | 全局标签池每枚标签展示被引用次数徽标；行内重命名（回车确认，重名自动合并素材指向）；删除前二次确认并提示影响素材数 |
| 存储安全 | 仅 IndexedDB 本地存储；首次创建项目自动申请浏览器「持久化存储」降低被自动清理的风险；图片入库自动压缩；项目级 JSON 备份 / 恢复（含全库备份，防止清缓存丢数据），恢复前自动校验文件结构（应用标识 / 版本 / 素材类型 / base64 完整性），非法文件直接拒绝、不落库；距上次备份超 7 天或从未备份时首页横幅提醒；本机存储使用率 ≥ 80% 时容量预警横幅（可 7 天内不再提醒） |
| 离线访问（PWA） | 支持安装到桌面 / 主屏幕；静态资源与导出 Worker 脚本经 Service Worker 本地缓存（依据 Vite build manifest 精确收集全部构建产物，含懒加载 chunk 与 Worker；manifest 不可用时回退解析构建产物引用），弱网或离线也能打开页面并完成打包导出（数据仍在本机 IndexedDB；URL 解析需后端在线） |
| 性能保障 | 首页画廊的素材计数与封面图改走索引查询，不再把全部素材（含图片二进制）载入内存；ZIP 打包、单文件 Markdown、备份 JSON 序列化均在 Web Worker 后台执行，导出大项目不卡界面；核心纯函数（文件名清洗 / 备份校验 / 笔记生成 / 导出估算）配套 Vitest 单元测试并接入 CI |
| 版权规范 | 首次使用网页解析弹出版权温馨提示（仅个人学习收藏，禁止商用） |

## 技术栈

- 前端：Vue 3（Composition API）+ Vite + Naive UI + Tailwind CSS + Dexie（IndexedDB）+ JSZip
- 后端：Node.js + Express（仅跨域代理，无数据库、无任何数据落盘）
- 解析：@mozilla/readability 正文提取 + linkedom DOM 解析

## 目录结构

```
TripSnippet/
├─ frontend/                # Vue3 前端（Vite 构建，dist 可部署至 GitHub Pages）
│  ├─ src/
│  │  ├─ views/             # 首页画廊 / 项目详情页
│  │  ├─ components/        # 导入弹窗、打包弹窗、素材行、备份中心等
│  │  ├─ db/                # Dexie IndexedDB schema
│  │  ├─ store/             # 全局响应式状态
│  │  └─ utils/             # 图片压缩 / Markdown 生成 / ZIP 打包 / JSON 备份
│  ├─ public/               # PWA：manifest / Service Worker / 图标（构建时原样拷入 dist）
│  ├─ .env.development      # 本地后端地址
│  ├─ .env.production      # 线上后端地址（部署前替换）
│  ├─ Dockerfile / nginx.conf  # 容器化构建与静态托管
│  └─ vite.config.js        # base: './' + hash 路由，适配 GitHub Pages
├─ backend/                 # Node Express 代理后端（兼容 Render 部署）
│  ├─ server.js             # 入口：CORS 白名单、限流、全局异常捕获
│  ├─ src/                  # 正文提取 / 图片代理 / 缓存 / 安全校验
│  ├─ render.yaml           # Render 一键部署配置
│  └─ Dockerfile            # 容器化构建
├─ .github/workflows/ci.yml     # CI：前端 lint + test + build、后端依赖与语法检查
├─ .github/workflows/deploy.yml # CD：main 分支 push 自动构建并发布前端到 GitHub Pages
├─ docker-compose.yml           # Docker 一键本地运行（前端 8000 / 后端 3000）
├─ design/                      # 前期静态设计稿（本地存档，不入库）
└─ README.md
```

## 数据模型

- 旅行项目 TravelProject：`id`、项目名、描述、创建时间
- 素材 Material：`id`、`projectId`、`type`（文本 / 图片 / 音频）、`title`、`content`、`sourceUrl`、`tags`、`remark`、`travelDate`（行程时间，如 `Day2 下午`）、`createTime`、`sourceType`（剪贴板 / 网页链接 / 本地文件 / 在线录音 / 手动导入标记）

## 本地启动教程

环境要求：Node.js ≥ 18

### 1. 启动后端（端口 3000）

```bash
cd backend
npm install
npm run dev        # 开发模式（文件变更自动重启）
# 或 npm start
```

启动后访问 `http://localhost:3000/api/health` 返回 `{"ok":true,...}` 即成功。

后端仅两个只读接口：`GET /api/extract`（正文提取）、`GET /api/image`（图片防盗链代理），**无数据库、无落盘，响应后数据即丢弃**。

### 2. 启动前端（端口 5173）

```bash
cd frontend
npm install
npm run dev
```

打开 `http://localhost:5173` 即可使用。开发环境后端地址由 `.env.development` 读取（`VITE_API_BASE=http://localhost:3000`），无需额外配置。

### 环境变量说明

| 文件 | 变量 | 说明 |
| --- | --- | --- |
| frontend/.env.development | `VITE_API_BASE` | 本地调试后端地址 |
| frontend/.env.production | `VITE_API_BASE` | 线上后端地址（Render），**部署前必须替换** |
| backend 环境变量 | `PORT` | 服务端口（Render 自动注入） |
| backend 环境变量 | `ALLOWED_ORIGIN` | CORS 白名单，逗号分隔，**不使用通配符 \*** |

## GitHub Pages 部署前端

前端已按 Pages 要求配置：`vite.config.js` 中 `base: './'`，路由使用 hash 模式，可在任意子路径下运行。

1. 修改 `frontend/.env.production`，将 `VITE_API_BASE` 替换为你的 Render 后端地址（见下节）。
2. 仓库已内置自动部署 workflow（`.github/workflows/deploy.yml`）：push 到 `main` 分支即自动构建（含图标生成）并发布到 GitHub Pages，无需手动操作。
3. 在仓库 **Settings → Pages** 中将 **Source** 设为 **GitHub Actions**。
4. 部署完成后，在 Render 后端的 `ALLOWED_ORIGIN` 中加入你的 Pages 域名（协议 + 域名，不带路径，如 `https://yourusername.github.io`），否则浏览器跨域请求会被拒绝。

### 绑定自定义域名（可选）

前端构建产物会自动带上 `frontend/public/CNAME` 文件（内容 `tripsnippet.knklab.online`）。以本项目为例：

1. 在你的 DNS 服务商（如 Cloudflare）添加 CNAME 记录：`tripsnippet` → `KkkNka1015.github.io`（如需由 GitHub Pages 自动签发证书，先设为 **DNS only** 灰云）。
2. 仓库 **Settings → Pages → Custom domain** 填入 `tripsnippet.knklab.online`，勾选 **Enforce HTTPS**。
3. 若 DNS 托管在 Cloudflare 并开启代理（橙云），HTTPS 由 Cloudflare 边缘证书提供，GitHub 侧无需等待签发。
4. 对应的后端 CORS 白名单需改为：`ALLOWED_ORIGIN=https://tripsnippet.knklab.online`。

## Render 部署后端

仓库已内置 `backend/render.yaml`，支持一键 Blueprint 部署。

1. 注册 / 登录 [Render](https://render.com)，进入 Dashboard → New → **Blueprint**，选择本仓库，Render 会自动识别 `render.yaml`。
   （也可以 New → Web Service 手动创建，Root Directory 填 `backend`，Build Command 填 `npm install`，Start Command 填 `npm start`。）
2. 在环境变量中将 `ALLOWED_ORIGIN` 的值替换为你的 GitHub Pages 前端域名（多个用逗号分隔）。
3. 免费套餐即可运行（Node ≥ 18，服务自带 `npm start` 启动脚本，健康检查路径 `/api/health`）。
4. 部署完成后，Render 会分配形如 `https://xxx.onrender.com` 的地址：
   - 填入 `frontend/.env.production` 的 `VITE_API_BASE`
   - 重新 `npm run build` 并发布前端

## Docker 本地运行（可选）

仓库内置容器化配置（前后端 Dockerfile + docker-compose），一条命令跑起整套服务：

```bash
docker compose up --build
```

- 前端：http://localhost:8000（多阶段构建：Node 编译 `dist` → Nginx 托管）
- 后端：http://localhost:3000（健康检查 `/api/health`）

说明：

- 前端为静态站点，后端地址在**构建期**通过 `VITE_API_BASE` 构建参数注入（compose 中已指向 `http://localhost:3000`，浏览器从宿主机直连）。
- 后端容器的 `ALLOWED_ORIGIN` 已包含 `http://localhost:8000`；若改用其他端口，请同步修改 `docker-compose.yml`。
- 单独构建镜像：`docker build -t tripsnippet-backend ./backend`、`docker build -t tripsnippet-frontend ./frontend`。

## 项目边界说明

- **版权**：网页解析功能仅用于个人学习与素材收藏，禁止商用，请遵守原网站版权协议。首次使用时会弹出版权温馨提示。
- **适配范围**：仅支持静态网页解析；SPA 动态渲染页面、需登录鉴权的页面、防盗链资源会自动降级为手动粘贴模式并给出友好提示。
- **定位**：轻量旅行素材管理工具，不支持视频存储与在线剪辑；素材类型限定为文本攻略、图片、音频（本地 mp3 / 在线录音 webm）。
- **隐私**：后端仅为跨域代理，不存储、不留存任何用户素材；所有数据在本机浏览器内，清理浏览器缓存会丢失数据，请善用备份中心定期导出 JSON 备份。

## 部署备注

- 前端内置 ESLint（flat config，`npm run lint`）；GitHub Actions CI（`.github/workflows/ci.yml`）在每次 push / PR 自动执行前端 lint + Vitest 单元测试（`npm run test`）+ build 与后端依赖安装、语法检查。
- `frontend/.env.development`、`frontend/.env.production` 中仅存放公开的后端接口地址，随仓库提交；私密配置请使用 `.env.local`（已被 .gitignore 忽略）。
- 后端内置限流（全局 120 次/分钟，网页解析 20 次/分钟，图片代理 90 次/分钟）与 CORS 白名单，防止公开部署后被滥用。
