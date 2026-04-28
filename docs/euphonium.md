


这个项目（正如你构思的 **Euphonium**）非常有前景，它切中了目前动漫爱好者本地资源管理的一些痛点：既需要轻量级的记录与笔记功能，又在进阶需求上有媒体库和画质提升的渴望。

针对你的想法，我为你梳理了一份详细的**需求文档**、**技术选型**、**具体执行流程**，并重点对**技术难点及解决方案**进行了深入剖析。

---

# 📚 一、 Euphonium 需求文档 (PRD)

## 1. Lite 版核心功能 (纯前端本地管理)
*   **本地目录扫描与解析**：用户通过浏览器授权选择本地视频文件夹，前端读取目录结构，利用正则或解析库提取动画名、季数、集数。
*   **Bangumi API 匹配与纠错**：根据提取的关键字请求 Bangumi API 获取候选番剧，用户可视情况确认或手动搜索替换。确认后，展示“视频文件 - 剧集”的匹配清单，支持手动调整映射。
*   **本地番剧库展示**：卡片式封面墙，支持按自定义分组（在看、收藏、搁置、回收站）、年份、评分等进行筛选和排序。
*   **本地流媒体播放**：点击卡片进入详情并直接播放本地源文件（受限于浏览器支持的格式，如 MP4, WebM 等）。
*   **高阶笔记功能**：
    *   基于视频播放器的联动笔记编辑器。
    *   **一键截图**：自动截取当前视频画面并插入笔记。
    *   **时间戳标记**：插入 `[12:34]` 格式的标记，点击后播放器自动跳转至对应进度（前提是文件仍存在）。
    *   **自动元数据**：自动带上观看日期、集数等信息。
*   **数据管理（迁移基础）**：所有数据存在浏览器本地（IndexedDB），支持完整导出为 JSON 文件，并在新环境导入。

## 2. Complete 版核心功能 (全功能媒体服务器)
*   **媒体服务器 (NAS化)**：支持内网穿透或局域网访问，支持手机、平板、PC 多端响应式 UI 访问。
*   **全格式视频支持**：突破浏览器限制，后端自动识别视频格式，对 MKV 等不支持的格式进行**实时转码 (On-the-fly transcoding)** 或直接串流封装。
*   **Docker 一键部署**：包括数据库、后端服务、前端资源、转码环境的完整镜像。
*   **画质超分辨率 (Super Resolution)**：
    *   离线超分：集成 Real-CUGAN / waifu2x，用户可提交“1080P -> 2K/4K”后台转码任务。
    *   （可选）实时超分：前端播放器集成 Anime4K 滤镜，利用客户端显卡进行实时渲染。
*   **数据无缝继承**：支持上传 Lite 版导出的 JSON 文件，自动与服务端配置的挂载目录进行路径重映射匹配。

---

# 🛠 二、 技术选型建议

## 前端 (Lite & Complete 共用 UI)
*   **框架**：Vue 3 或 React (推荐 React，因为视频播放器和富文本编辑器生态更好，如 `video.js`, `TipTap`)。
*   **本地数据库**：`Dexie.js` (对 IndexedDB 的优秀封装，解决 Lite 版海量数据和文件句柄存储问题)。
*   **富文本编辑器**：`TipTap` 或 `Quill` (极度易于自定义时间戳控件和截图插入机制)。
*   **解析库**：`anitomy-js` (WebAssembly版本) 取代手写正则，专门用于解析动漫复杂的命名组。

## 后端 (仅 Complete 版)
*   **语言/框架**：**Python + FastAPI**。(极其推荐！因为后续的超分辨率模型基本都在 Python/PyTorch 生态，且 Python 处理本地文件、调用 FFmpeg 非常方便)。
*   **数据库**：**SQLite**配合 `SQLAlchemy` (轻量、免安装，对于个人媒体库完全足够)。
*   **视频处理核心**：`FFmpeg` (通过 `ffmpeg-python` 调用，处理转码、切片 HLS、提取字幕)。
*   **后台任务队列**：`Celery` + `Redis`（用于处理耗时极长的视频超分辨率任务）。

---

# 🧗 三、 核心技术难点与解决方案

这是整个项目成败的关键，有几个坑需要提前规避：

## 难点1：Lite版的本地文件扫描与路径持久化
**问题**：由于浏览器的安全沙盒机制，网页无法随意读取本地文件，且关闭网页后会失去文件访问权限。
**解决方案**：使用 HTML5 **File System Access API** (`showDirectoryPicker`)。
1.  用户点击“扫描文件夹”，弹出授权窗口。
2.  获取到文件夹的 `FileSystemDirectoryHandle`，你可以将其存入 IndexedDB。
3.  下次用户打开网页点击播放时，从 IndexedDB 取出该 Handle 并请求重新授权（或静默获取 file 对象），利用 `URL.createObjectURL(file)` 交给 `<video>` 标签播放。

## 难点2：Lite版浏览器的视频格式兼容性 (致命痛点)
**问题**：动漫资源有 80% 是 `.mkv` 格式封装，往往包含 `HEVC/H.265` 编码和 `ASS` 特效字幕。**主流浏览器原声不支持播放 MKV，也不支持渲染 ASS 字幕。**
**解决方案**：
*   **Lite 版的妥协**：只能播放 MP4/WebM，若遇到 MKV，提示用户“Lite 版暂不支持当前格式，建议使用 Complete 版或手动转换为 MP4”。对于字幕，如果是外挂 `.ass`，前端可以使用 `ass.js` (SubtitlesOctopus) 等库基于 WebAssembly 在 canvas 上强行渲染字幕。
*   **Complete 版的杀招**：后端使用 FFmpeg 将 MKV 实时提取视频流和音频流，转封装为 HLS (`.m3u8`) 串流推给前端，前端用 `hls.js` 播放。若编码是 H.265，可利用硬件加速转码为 H.264。

## 难点3：动漫文件名的极度不规则 (正则的噩梦)
**问题**：诸如 `[Sakato] Sousou no Frieren - 01 (B-Global 1080p).mkv` 或 `[Moozzi2] 86 - 01~02.mkv`，纯正则很难完美提取名字和集数。
**解决方案**：
绝对不要从零写正则！使用开源的 **Anitomy** 库。它通过词法分析专门解析动漫文件名。Complete 版使用 `anitomy` Python 库，Lite 版可以将 Anitomy 编译为 WebAssembly 在前端调用。

## 难点4：笔记中的视频一键截图功能
**问题**：如何优雅地把几 GB 视频里的某一帧抠出来放进富文本编辑器？
**解决方案**：
前端基于 HTML5 `<canvas>` 实现。用户点击“截图”时，触发：
```javascript
const canvas = document.createElement('canvas');
canvas.width = videoElement.videoWidth;
canvas.height = videoElement.videoHeight;
canvas.getContext('2d').drawImage(videoElement, 0, 0);
const imgDataUrl = canvas.toDataURL('image/jpeg', 0.8);
// 然后将 imgDataUrl 插入到 TipTap/Quill 富文本编辑器中
```
*注意：在 Complete 版中跨域拉取视频流时，video 标签必须设置 `crossOrigin="anonymous"`，否则 canvas 会报画布污染错误，无法导出图片。*

## 难点5：Complete 版的超分辨率转码 (算力与时间)
**问题**：Real-CUGAN 或 waifu2x 进行视频逐帧放大（比如 24分钟的 1080p 视频），即使用 3080 级别的显卡，也需要好几个小时。不能让用户干等，也不能阻塞服务器。
**解决方案**：
1.  **架构设计**：必须采用异步队列（FastAPI -> Celery -> 显卡跑模型）。
2.  **Docker 显卡穿透**：如果通过 Docker 部署 Complete 版，需要配置 `Nvidia Container Toolkit`，让容器内能调用宿主机 GPU。这是编写 Dockerfile 和 `docker-compose.yml` 时的一大难点。
3.  **替代方案 (强烈推荐添加)**：除了后端的离线超分，前端播放器可以集成 **Anime4K** (基于 WebGL 的实时动漫拉伸算法)。用户播放时点一下“画质增强”，利用浏览器调用设备的 GPU 实时渲染，效果惊艳且零等待。

---

# 🗺 四、 研发流程建议 (Milestones)

**第一阶段：跑通核心闭环 (Lite 版 MVP)**
1.  搭建前端脚手架，完成 IndexedDB 封装。
2.  实现 File System Access API 扫描目录读取文件名。
3.  接入 Bangumi API 完成“识别 -> 检索 -> 确认绑定”流程。
4.  实现番剧卡片列表和基本的 `<video>` 播放（先只测试 MP4）。

**第二阶段：笔记系统 (Lite 版完善)**
1.  接入富文本编辑器，开发定制化的“时间戳”和“截图”插件。
2.  完善卡片分组、数据分析热力图、JSON 导入导出。

**第三阶段：进军服务端 (Complete 版基础)**
1.  用 Python/FastAPI 搭建后端，复用第一阶段的前端代码并稍加改造（数据源从 IndexedDB 切换为 Axios 请求 API）。
2.  使用 FFmpeg 实现后端目录扫描与 HLS 流媒体实时转换（攻克 MKV 播放难题）。
3.  编写服务端挂载与扫库逻辑，将 Lite 版 JSON 里的条目和后端绝对路径进行匹配。

**第四阶段：超分辨与容器化 (Complete 版终极形态)**
1.  集成 Anime4K WebGL 实时滤镜到前端播放器。
2.  编写 Python 脚本调用 Real-CUGAN 处理本地视频流任务队列。
3.  编写完整的 `Dockerfile` 和 `docker-compose.yml`，提供极简的部署文档。

你的思路已经非常成熟，这个项目具有极强的实用价值和开源潜力（类似一个专属于动漫的极简版 Plex/Jellyfin，外加独一无二的笔记联动和画质优化机制）。先从 Lite 版的前端开始动手会是最佳切入点！