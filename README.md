# Euphonium Lite

![Vue](https://img.shields.io/badge/Vue-3-42b883)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6)
![Vite](https://img.shields.io/badge/Vite-7-646cff)
![IndexedDB](https://img.shields.io/badge/storage-IndexedDB-6b7280)

Euphonium Lite 是一个纯前端、本地优先的动画媒体库工具。它通过浏览器目录授权扫描本地视频文件，解析文件名中的标题、季度和集数，结合 Bangumi 候选结果生成可确认的媒体库，并把馆藏、剧集、匹配记录、播放进度和笔记保存在浏览器本地。

Lite 版本专注验证单机使用闭环：授权目录、扫描本地文件、自动匹配、人工校正、馆藏浏览、放映厅播放、笔记、合集、回收站和 JSON 备份。

## 截图素材建议

README 可以插入截图，但建议不要直接把图片散放在 `docs/` 根目录。推荐统一放在 `docs/images/`，使用英文小写文件名，README 中用相对路径引用，例如 `![首页馆藏](docs/images/home-library.png)`。

建议准备这些截图：

| 图片       | 建议路径                          | 用途                                             |
| ---------- | --------------------------------- | ------------------------------------------------ |
| 首页馆藏   | `docs/images/home-library.png`    | 展示封面墙、筛选、收藏和观看进度。               |
| 导入审核   | `docs/images/import-review.png`   | 展示 Bangumi 候选、剧集映射和附加视频标签。      |
| 放映厅     | `docs/images/theatre-player.png`  | 展示播放器、选集、附加视频、字幕和笔记入口。     |
| 笔记工作台 | `docs/images/notes-workbench.png` | 展示 Markdown 风格笔记、截图图片和全部笔记列表。 |
| 设置与备份 | `docs/images/settings-backup.png` | 展示 JSON 导入导出和本地设置。                   |

提交时把图片和文档一起提交即可；如果图片较大，优先压缩到单张 300KB-800KB 左右，避免 README 加载过慢。

## 功能特性

- 本地目录扫描：基于 File System Access API 读取用户授权目录，媒体文件不会上传到服务器。
- 文件名解析：支持字幕组命名、`S01E01`、`EP01`、中文集数、普通数字集数、集数范围、技术标签清理和标题候选生成。
- Bangumi 匹配：按目录聚合视频文件，调用 Bangumi v0 API 搜索动画候选，保留最多 4 个候选供确认。
- 剧集映射：支持单文件改集数、批量偏移、重置解析、未解析文件提示和附加视频标签编辑。
- 附加视频：扫描到 OP/ED/NCOP/NCED/PV/特典/特别篇等子文件夹时，会挂到父作品下，不作为正片剧集计入观看进度。
- 馆藏管理：首页提供封面墙、搜索、年份/标签筛选、排序、最近、收藏、回收站、自定义合集和观看进度修改。
- 放映厅：读取本地授权文件播放，支持正片/附加视频切换、文件源选择、播放进度保存、0.5x-2.0x 倍速、音量、全屏和 `.srt` / `.vtt` / `.ass` / `.ssa` 字幕。
- 笔记系统：支持动画/剧集/文件笔记、Markdown 风格编辑预览、自动保存、时间戳、截图图片内联插入、软删除和恢复。
- 数据备份：支持 JSON 导出/导入馆藏、剧集、文件、匹配记录和笔记元数据。
- UI 设置：主题、精简模式、解析测试和导航顺序保存在浏览器本地。

## 技术栈

- Vue 3
- Vue Router
- TypeScript
- Vite
- Dexie / IndexedDB
- lucide-vue-next
- pnpm

## 环境要求

- Node.js `^20.19.0 || >=22.12.0`
- pnpm `10.x`
- Chromium 内核浏览器。目录扫描依赖 File System Access API，Firefox/Safari 支持有限。

## 快速开始

```sh
pnpm install
pnpm run dev
```

常用命令：

```sh
pnpm run type-check
pnpm run build-only
pnpm run build
pnpm run lint
```

## 使用流程

1. 在「导入媒体」页选择本地动画目录。
2. 点击「开始扫描」，应用会递归扫描视频文件并计算采样哈希；正片目录下的特典、OP/ED、PV 等视频会作为附加视频归入同一作品。
3. 在扫描结果中确认 Bangumi 候选，并按需修正剧集映射或附加视频标签。
4. 写入馆藏后，在首页浏览、筛选、收藏或加入自定义合集。
5. 进入放映厅播放本地文件、切换正片或附加视频、记录进度、加载字幕并编写笔记。
6. 在设置页导出 JSON 备份，或在新浏览器环境中导入已有备份。

## 数据存储

应用没有后端服务，主要数据保存在浏览器本机：

- `IndexedDB / EuphoniumLite`：媒体目录、动画、剧集、文件、匹配记录、自定义合集。
- `IndexedDB / EuphoniumLiteNotes`：笔记和附件数据。
- `localStorage / euphonium-ui-settings`：主题、精简模式、解析规则输入等设置。
- `localStorage / euphonium-nav-order`：内置导航和自定义合集顺序。
- `localStorage / euphonium-library-filter-options`：首页年份和标签筛选缓存。

JSON 备份不包含浏览器目录授权句柄，也不包含附件 Blob。恢复备份后需要重新授权媒体目录，附件目前只导出元数据。

## 项目结构

```text
docs/                  需求、架构和历史方案文档
public/                静态资源
src/db/                Dexie 数据库定义与迁移
src/models/            领域模型类型
src/router/            Vue Router 路由
src/services/          扫描、匹配、写库、播放、笔记、导入导出等服务
src/ui/                业务界面、组件、样式和 UI 状态
src/utils/             文件名解析等工具
```

## 文档

- [详细需求与架构文档](docs/README-TECHNICAL.md)
- [Complete 版设计方案](docs/COMPLETE-DESIGN.md)
- [V3 技术方案](docs/euphonium-V3.md)
- [V2 需求与技术文档](docs/euphonium-V2.md)
- [原始方案整理](docs/euphonium.md)

## 当前限制

- 浏览器播放能力受 `<video>` 支持限制，部分 MKV、H.265 或特殊音轨无法直接播放。
- `.ass` / `.ssa` 字幕会在前端转换为 WebVTT 加载，文字内容可用，但 ASS 样式、定位和特效不会完整保留。
- Lite 版不包含服务端转码、HLS、远程访问、多设备同步或超分任务。
- Bangumi API 访问受网络环境和接口可用性影响。
- JSON 导出暂不包含附件 Blob，也不能恢复浏览器目录授权。
- 设置页的自定义正则目前用于持久化与解析测试，尚未接入导入扫描链路。
