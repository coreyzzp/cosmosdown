# MiniUBrowser - 音频文件转换器

基于 **Tauri 2 + TypeScript** 的跨平台小宇宙音频提取/转换工具：从 SQLite（Cosmos）读取播客单集，并转换为 MP3。

> 本仓库已从 Electron 架构迁移到 Tauri。旧 Electron 后端暂存在 [`_legacy/electron`](_legacy/electron) 供对照移植。

## 功能特性

- SQLite / Cosmos 数据库读取
- 多格式音频转 MP3（FFmpeg）
- 实时进度、批量转换、音质选择
- macOS 小宇宙应用自动检测与连接
- 轻量桌面壳（系统 WebView + Rust）

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Tauri 2 |
| 后端 | Rust（commands / services） |
| 前端 | TypeScript + Vite（vanilla） |
| 数据库 | SQLite（计划：`rusqlite`） |
| 音频 | FFmpeg（系统安装 / 后续可 sidecar） |

## 架构

```
miniubrowser/
├── index.html                 # Vite 入口
├── src/                       # 前端
│   ├── main.ts                # UI 逻辑（原 renderer）
│   ├── api/bridge.ts          # invoke / event 桥（替代 preload）
│   ├── styles.css
│   └── types/
├── src-tauri/                 # Rust 后端
│   ├── src/
│   │   ├── commands/          # 对应原 Electron IPC
│   │   ├── services/          # Cosmos / FFmpeg / 小宇宙检测
│   │   ├── models.rs
│   │   ├── state.rs
│   │   └── lib.rs
│   ├── capabilities/
│   └── tauri.conf.json
└── _legacy/electron/          # 旧 Electron 实现（迁移对照）
```

**通信模型**

- 前端 `invoke('open_database' | 'get_files' | ...)` → Rust commands
- Rust `emit('app-message', ...)` → 前端进度/自动连接事件

## 系统要求

- Node.js 18+
- Rust stable（已安装 `rustc` / `cargo`）
- 平台依赖见 [Tauri 前置条件](https://tauri.app/start/prerequisites/)
- 音频转换需要系统 FFmpeg（后续任务接入）

```bash
# macOS
brew install ffmpeg
```

## 安装和运行

```bash
npm install
npm run tauri:dev      # 开发
npm run tauri:build    # 打包
```

仅前端：

```bash
npm run dev
npm run build
```

## 后续迁移任务（建议拆分）

1. **CosmosDbService → Rust**：`rusqlite` 读取 playlist / audio 表，复刻本地文件前缀匹配
2. **AudioProcessor → Rust**：调用系统 FFmpeg，进度事件回传前端
3. **清理**：删除 `_legacy/electron`、旧 electron-builder / esbuild 脚本
4. **打包**：图标、权限、FFmpeg 分发策略（系统 PATH vs sidecar）

## 使用说明

1. 启动后若检测到小宇宙，会尝试自动连接 Cosmos DB
2. 也可手动「选择数据库」→「连接」
3. 选择输出目录与音质
4. 勾选已下载单集 →「开始转换」

## 数据库结构

应用会按 Cosmos / 小宇宙实际表结构读取（见 `_legacy/electron/services/CosmosDbService.ts` 与 `src/types/cosmos-db.ts`）。通用 `audio_files` / `files` 示例表已不再是主路径。

## 许可证

ISC License
