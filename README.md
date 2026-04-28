# Euphonium Lite

Euphonium Lite 是一个纯前端的本地动画媒体库工具。它通过浏览器目录授权扫描本地视频文件，解析文件名中的标题、季度和集数，结合 Bangumi 候选结果生成可确认的媒体库，并把馆藏、剧集、匹配记录和笔记保存在浏览器本地。

当前分支是 demo 版本，重点验证 Lite 版的核心闭环：扫描本地目录、自动匹配、人工修正、馆藏浏览、播放入口、笔记、回收站和 JSON 备份。

## 功能

- 本地目录扫描：使用 File System Access API 读取用户授权目录，不上传本地文件。
- 文件名解析：支持常见字幕组命名、`S01E01`、中文集数、普通集数、技术标签清理和标题候选生成。
- Bangumi 匹配：按目录聚合文件，搜索 Bangumi 候选，保留最多 4 个可选动画。
- 剧集映射：按文件选择目标集数，支持批量偏移和重新解析。
- 真实馆藏：导入确认后写入 IndexedDB，不再依赖 mock 数据。
- 首页管理：支持全部、最近、收藏、回收站分组，以及软删除和批量恢复。
- 播放与笔记：进入剧集页查看关联文件、播放浏览器支持的视频，并保存剧集笔记。
- 数据管理：支持 JSON 导出和导入，设置页提供 IndexedDB 清空入口。
- UI 设置：主题、精简模式和自定义解析设置保存在浏览器 `localStorage`。

## 技术栈

- Vue 3
- Vue Router
- TypeScript
- Vite
- Dexie / IndexedDB
- Element Plus
- lucide-vue-next
- pnpm

## 环境要求

- Node.js `^20.19.0 || >=22.12.0`
- pnpm `10.x`
- 推荐 Chromium 内核浏览器。目录扫描依赖 File System Access API，Firefox/Safari 支持有限。

## 本地开发

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

## 数据存储

应用没有后端服务，主要数据都保存在浏览器本机：

- `IndexedDB / EuphoniumLite`：动画、剧集、文件、扫描目录、匹配记录。
- `IndexedDB / EuphoniumLiteNotes`：笔记和附件元数据。
- `localStorage / euphonium-ui-settings`：主题、精简模式、自定义正则等 UI 设置。

JSON 备份覆盖馆藏、剧集、文件、匹配和笔记数据。浏览器目录授权句柄不能通过 JSON 恢复，这是浏览器安全模型限制；重新授权目录后可以继续扫描。

## 项目结构

```text
docs/                  需求和技术方案文档
public/                静态资源
src/db/                Dexie 数据库定义
src/models/            领域模型类型
src/services/          Bangumi、扫描、匹配、存储、导入导出等服务
src/ui/                业务界面、组件和 UI 状态
src/utils/             文件名解析等工具
```

## 文档

- [V3 技术方案](docs/euphonium-V3.md)
- [V2 需求与技术文档](docs/euphonium-V2.md)
- [原始方案整理](docs/euphonium.md)

## 当前限制

- 浏览器可播放格式受 `<video>` 支持限制，部分 MKV/编码无法直接播放。
- JSON 导出暂不包含附件 Blob，只保留附件元数据。
- Bangumi API 访问受网络环境和接口可用性影响。
- 本项目是 Lite 版前端验证，完整版的服务端转码、远程访问和超分任务不在当前实现范围。
