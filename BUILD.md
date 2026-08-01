# 构建和打包指南（Tauri）

## 前置要求

- Node.js 18+
- Rust stable（`rustc` / `cargo`）
- 平台系统依赖：见 [Tauri Prerequisites](https://tauri.app/start/prerequisites/)
- 音频转换：系统 FFmpeg（业务接入后需要）

```bash
# macOS
brew install ffmpeg
xcode-select --install   # 若缺少编译工具链
```

## 安装

```bash
npm install
```

## 开发

```bash
npm run tauri:dev
```

仅调试前端（无 Rust 后端能力）：

```bash
npm run dev
```

## 打包

```bash
npm run tauri:build
```

产物在 `src-tauri/target/release/bundle/`。

## 图标

默认使用 `src-tauri/icons/`。可用 `assert/icon.png` 重新生成：

```bash
npm run tauri icon assert/icon.png
```

## 清理

```bash
npm run clean
```

## 迁移说明

旧 Electron 构建（electron-builder / esbuild / sqlite3 rebuild）已移除。对照实现见 `_legacy/electron/`。
