# Legacy Electron implementation

This directory keeps the previous Electron/TypeScript backend for reference while the app migrates to Tauri.

| Legacy module | Tauri target |
|---|---|
| `electron/main.ts` + `preload.ts` | `src-tauri/src/commands/` + `src/api/bridge.ts` |
| `electron/services/CosmosDbService.ts` | `src-tauri/src/services/cosmos_db.rs` |
| `electron/services/AudioProcessor.ts` | `src-tauri/src/services/audio_processor.rs` |
| `electron/services/XiaoyuzhouDetector.ts` | `src-tauri/src/services/xiaoyuzhou.rs` |
| `electron/services/DatabaseService.ts` | (optional / unused by current UI flow) |

Delete this folder after the Rust ports are complete and verified.
