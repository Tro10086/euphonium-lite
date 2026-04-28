# 📚 Euphonium 需求文档与技术选型 (最终版)

---

## 一、Lite 版核心功能

| 功能模块 | 描述 |
|---------|------|
| **本地目录扫描** | File System Access API (`showDirectoryPicker`) 授权选择文件夹。同一文件夹聚合去重，只搜索一次 Bangumi |
| **文件名解析与动画匹配** | **自定义增强型解析流水线**：噪音消除字典 → 正则瀑布流（内置+用户自定义）→ 文件夹名称兜底 → Bangumi API 校验 → 目录绑定机制。详见第三章 |
| **Bangumi API 匹配** | Search API 获取候选 → 默认加载首项 → Episodes API 获取 `ep`/`sort` 映射 → 智能匹配。审核页支持切换候选（重新请求 Episodes）、拖拽调整、批量偏移 |
| **番剧库展示** | 卡片式封面墙。按分组（在看/已看/搁置/回收站）、年份、评分筛选。`sync_status` 标记刮削状态 |
| **本地播放** | IndexedDB 取回 `FileSystemDirectoryHandle`，顺藤摸瓜定位文件，`URL.createObjectURL(file)` 交给 `<video>` 播放 |
| **笔记系统** | **TipTap** 富文本编辑器。支持一键截图、时间戳标记 `[01:25]`（点击跳转播放）、自动元数据 |
| **数据管理** | IndexedDB (Dexie.js) 多表存储。导出 JSON（元数据+笔记）+ Zip（含附件图片），Complete 版路径重映射继承 |

---

## 二、Complete 版核心功能

| 功能模块 | 描述 |
|---------|------|
| **媒体服务器** | 内网穿透/局域网访问，多端响应式 UI |
| **全格式支持** | FFmpeg 实时转封装 HLS (`.m3u8`)，H.265 硬件加速转 H.264 |
| **Docker 部署** | 数据库 + 后端 + 前端 + 转码环境完整镜像 |
| **超分辨率** | 离线：Real-CUGAN / waifu2x (Celery 队列)。实时：Anime4K WebGL 滤镜 |
| **数据继承** | 上传 Lite 版 JSON，服务端挂载目录路径重映射 |

---

## 三、文件名解析与动画匹配 (核心方案)

**不引入第三方解析库**（如 anitomy），采用完全可控的自定义解析流水线。

### 1. 噪音消除字典（预处理）

内置常见干扰词字典，从文件名中剔除冗余信息：

| 类别 | 示例 |
|-----|------|
| 字幕组 | `^\[.*?\]\s*` 开头方括号内容 |
| 分辨率 | `1080p`, `720p`, `4k`, `2160p`, `1920x1080` |
| 视频源 | `BD`, `BDRip`, `Web-DL`, `WebRip`, `TVRip`, `DVD` |
| 编码格式 | `x264`, `x265`, `HEVC`, `AVC`, `10bit`, `FLAC`, `AAC` |
| 扩展名 | `.mp4`, `.mkv`, `.avi` |
| 括号冗余 | `(BD 1920x1080 x.265-10Bit Flac)` 等 |

处理逻辑：
```javascript
let cleanName = filename
  .replace(/^\[.*?\]\s*/, '')           // 剔掉开头字幕组
  .replace(/\.\w+$/, '')                // 剔掉扩展名
  .replace(/[\(\[].*?(1080p|x265|BD|Web-DL|10bit).*?[\)\]]/gi, ''); // 剔掉含关键词的括号
```

### 2. 正则瀑布流（内置 + 用户自定义）

按优先级排列的命名捕获组正则数组，**支持用户在设置中自定义正则并置顶**：

```javascript
const regexList = [
  /(?<title>.+?)\s*-\s*第(?<episode>\d{1,4})(?:话|集)/i,      // 标题 - 第01话
  /(?<title>.+?)\s*-\s*(?<episode>\d{1,4})/i,                  // 标题 - 01
  /(?<title>.+?)\s*S(?<season>\d{1,2})E(?<episode>\d{1,4})/i,  // 标题 S01E01
  /\[(?<title>.+?)\]\s*\[(?<episode>\d{1,4})\]/i               // [标题][01]
];

// 用户自定义正则优先级最高
const userRegex = getFromSettings('custom_regex');
if (userRegex) regexList.unshift(new RegExp(userRegex, 'i'));

// 执行匹配，成功即跳出
for (const regex of regexList) {
  const match = cleanName.match(regex);
  if (match?.groups) {
    extracted.title = match.groups.title.trim();
    extracted.episode = match.groups.episode;
    break;
  }
}
```

### 3. 文件夹名称兜底（降维打击）

如果正则提取的 `title` 为空，或 Bangumi 搜索结果为 0，**直接取视频所在的上级文件夹名称**作为搜索词。

动漫本地存放通常是分文件夹的：`D:\Anime\葬送的芙莉莲\01.mkv`，文件夹名本身就是最准确的番剧名。

### 4. 目录绑定机制（Directory Binding）

解决同一文件夹下后续集数的重复解析问题：

| 步骤 | 操作 |
|-----|------|
| **初次扫描** | 提取 `title` + `episode`，请求 Bangumi Search API |
| **用户审核** | 前端展示候选列表 + 剧集映射，用户确认或手动搜索 Bangumi ID 强制绑定 |
| **记忆绑定** | 系统在 IndexedDB 记录：`{ folderName: "葬送的芙莉莲", bgm_id: 326782 }` |
| **后续集数** | 同一文件夹下的 `02.mkv`, `03.mkv`... **跳过标题解析和 API 搜索**，直接继承该 `bgm_id`，只提取集数即可 |

### 5. 集数智能匹配算法

拿到 Bangumi Episodes API 返回的 `ep`（相对集数）和 `sort`（绝对集数）后：

**策略 1：直接命中**
```javascript
episodes.find(e => e.type === 0 && (e.sort_num === extractedNum || e.ep_num === extractedNum));
```

**策略 2：智能偏移推断**
```javascript
const minLocal = Math.min(...localFiles.map(f => f.extractedNum));
const minOfficial = Math.min(...officialEps.map(e => e.sort_num));
const offset = minOfficial - minLocal; // 如 29 - 1 = 28
// 给所有本地文件集数 +offset 后再次匹配
```

**策略 3：UI 防线**
审核页提供【批量偏移】输入框（如 `+28`）+ 拖拽微调，人工对齐。

---

## 四、技术选型

### 前端

| 组件 | 选型 |
|-----|------|
| 框架 | Vue3 |
| 本地数据库 | Dexie.js |
| 笔记编辑器 | **TipTap** (基于 ProseMirror) |
| 视频播放 | `<video>` + `hls.js` (Complete 版) |
| 字幕渲染 | `ass.js` (SubtitlesOctopus) |

### 后端 (Complete 版)

| 组件 | 选型 |
|-----|------|
| 框架 | Python + FastAPI |
| 数据库 | SQLite + SQLAlchemy |
| 视频处理 | FFmpeg |
| 任务队列 | Celery + Redis |
| 文件名解析 | GuessIt / anitomy (Python) |

---

## 五、数据库表结构

### `animes` — 番剧主表

```typescript
interface AnimeEntity {
  bgm_id: number;              // 主键
  title: string;               // 优先 name_cn，回退 name
  original_title: string;
  cover_url: string;           // images.large
  summary: string;
  air_date: string;
  total_eps: number;
  bgm_rating: number;
  tags: string[];
  my_rating: number;
  watch_status: 'watching' | 'watched' | 'on_hold' | 'dropped' | 'unwatched';
  sync_status: 'pending' | 'completed' | 'error';
  created_at: number;
}
```

### `episodes` — 官方剧集表

```typescript
interface EpisodeEntity {
  ep_id: number;               // 主键
  bgm_id: number;              // 外键
  ep_num: number;              // 相对集数 (API 的 ep)
  sort_num: number;            // 绝对集数 (API 的 sort)
  type: number;                // 0: 正片, 1: SP, 2: OP, 3: ED
  title: string;
  desc: string;
  air_date: string;
}
```

### `files` — 本地文件映射表

```typescript
interface FileEntity {
  file_id: number;
  bgm_id: number;
  ep_id?: number;
  filename: string;
  file_handle: FileSystemDirectoryHandle;  // 文件夹句柄
  relative_path: string;
}
```

### `watch_history` — 观看历史

```typescript
interface WatchHistoryEntity {
  history_id: number;
  bgm_id: number;
  ep_id: number;
  watched_date: string;        // YYYY-MM-DD
  created_at: number;
}
```

### `notes` — 笔记表

```typescript
interface NoteEntity {
  note_id: number;
  bgm_id: number;
  ep_id?: number;              // 空则为整部番"总评"
  content_json: object;        // TipTap JSON AST
  plain_text?: string;         // 用于全文搜索
  created_at: number;
  updated_at: number;
}
```

### `attachments` — 附件/截图表

```typescript
interface AttachmentEntity {
  id: string;                  // UUID
  data: Blob;                  // 图片二进制
}
```

---

## 六、DTO 转换器

### 番剧转换

```typescript
function mapApiToAnimeEntity(api: BgmSubjectApi): AnimeEntity {
  return {
    bgm_id: api.id,
    title: api.name_cn || api.name || "未知番剧",
    original_title: api.name,
    cover_url: api.images?.large || "",
    summary: api.summary || "暂无简介",
    air_date: api.date || "",
    total_eps: api.eps || 0,
    bgm_rating: api.rating?.score || 0,
    tags: api.tags?.slice(0, 5).map(t => t.name) || [],
    my_rating: 0,
    watch_status: 'unwatched',
    sync_status: 'pending',
    created_at: Date.now()
  };
}
```

### 剧集转换

```typescript
function mapApiToEpisodeEntities(apiEps: BgmEpisodeApi[]): EpisodeEntity[] {
  return apiEps
    .filter(ep => ep.type === 0 || ep.type === 1)
    .map(ep => ({
      ep_id: ep.id,
      bgm_id: ep.subject_id,
      ep_num: ep.ep,
      sort_num: ep.sort,
      type: ep.type,
      title: ep.name_cn || ep.name || `第 ${ep.sort} 集`,
      desc: ep.desc || "",
      air_date: ep.airdate || ""
    }));
}
```

---

## 七、笔记系统实现 (TipTap)

### 存储格式

- **编辑器**：TipTap（ProseMirror 底层）
- **数据库存储**：TipTap JSON AST（`content_json`），不是 HTML 字符串
- **图片**：Blob 存入 IndexedDB `attachments`，JSON 中只存 `data-image-id` 指针
- **导出到本地**：调用 `editor.getMarkdown()` 转为 Markdown 文本，图片转为 `attachment://{id}`，配合 Zip 打包

### 截图流程

```javascript
const video = document.querySelector('video');
const canvas = document.createElement('canvas');
canvas.width = video.videoWidth;
canvas.height = video.videoHeight;
canvas.getContext('2d').drawImage(video, 0, 0);

canvas.toBlob(async (blob) => {
  const imageId = crypto.randomUUID();
  await db.attachments.put({ id: imageId, data: blob });
  
  editor.commands.insertImage({ 
    src: URL.createObjectURL(blob), 
    'data-image-id': imageId 
  });
}, 'image/jpeg', 0.85);
```

### 保存笔记

```javascript
const json = editor.getJSON();
// 遍历 JSON 树，清空 image 节点的 src（blob URL 刷新失效），保留 data-image-id
cleanBlobUrls(json);
await db.notes.put({ ...noteData, content_json: json });
```

### 读取/加载笔记

```javascript
const note = await db.notes.get(noteId);
const jsonContent = note.content_json;

async function injectImages(node) {
  if (node.type === 'image' && node.attrs['data-image-id']) {
    const att = await db.attachments.get(node.attrs['data-image-id']);
    node.attrs.src = URL.createObjectURL(att.data);
  }
  if (node.content) {
    for (const child of node.content) await injectImages(child);
  }
}

await injectImages(jsonContent);
editor.commands.setContent(jsonContent);
```

### 时间戳功能

TipTap 自定义节点 `timestamp`：

```javascript
// 渲染为不可编辑节点
<span class="anime-timestamp" data-time="85.5" contenteditable="false">[01:25]</span>

// 点击跳转
document.querySelector('.editor').addEventListener('click', (e) => {
  if (e.target.classList.contains('anime-timestamp')) {
    const time = parseFloat(e.target.dataset.time);
    document.querySelector('video').currentTime = time;
    video.play();
  }
});
```

### 导出 Markdown

```javascript
const markdown = editor.getMarkdown();
// 图片节点转为 ![描述](attachment://{id}.jpg)
// Zip 打包：.md 文件 + images/ 文件夹（从 IndexedDB 提取 Blob）
```

---

## 八、核心技术难点

| 难点 | 解决方案 |
|-----|---------|
| **本地文件持久化** | File System Access API + IndexedDB 存 `FileSystemDirectoryHandle`。不存绝对路径，用 Handle + 相对路径定位 |
| **视频格式兼容** | Lite：仅 MP4/WebM，MKV 提示用 Complete。Complete：FFmpeg 实时 HLS 转码 |
| **文件名解析** | **自定义解析流水线**：噪音消除 → 正则瀑布流（支持用户自定义）→ 文件夹名称兜底 → 目录绑定机制 |
| **集数映射冲突** | 双字段 `ep_num` + `sort_num`。匹配瀑布流：①直接命中 ②智能偏移推断 ③UI 手动偏移 |
| **API 请求优化** | 必须先请求 Episodes API 获取真实 `ep`/`sort` 才能匹配。切换候选番剧时才重新请求 |
| **超分辨率** | FastAPI → Celery → GPU 队列。Docker Nvidia Container Toolkit。前端 Anime4K WebGL 实时替代 |

---

## 九、研发里程碑

| 阶段 | 目标 |
|-----|------|
| **第一阶段** | Lite MVP：前端脚手架、Dexie.js 多表、File System Access API 扫库、自定义解析流水线、Bangumi Search + Episodes API、首项默认加载、MP4 播放 |
| **第二阶段** | Lite 笔记：TipTap 编辑器、截图 Blob 存储、时间戳插件、剧集管理/重新匹配、手动偏移、卡片分组、热力图、JSON/Zip 导出 |
| **第三阶段** | Complete 基础：Python/FastAPI、SQLite、FFmpeg HLS 转码、服务端扫库、Lite JSON 路径重映射 |
| **第四阶段** | Complete 终极：Anime4K WebGL、Real-CUGAN Celery 队列、Docker Compose、Nvidia 显卡穿透 |