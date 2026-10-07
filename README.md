# 交付工程师个人助手

Windows Electron 桌面应用：经验记录与关键词检索、任务、项目问题、Bug 复盘、文档导入、日报与文件导出、本地备份恢复、可选 Plane 问题快照导入。

安装版内置运行环境和本地存储，无需 MySQL。`release/DeliveryAssistant-Setup-1.0.0-x64.exe` 为中文 NSIS 向导安装器。

开发：`pnpm install --frozen-lockfile` → `pnpm icons` → `pnpm test` → `pnpm start`。

打包：`pnpm dist`；源码交付：`pnpm source`。详见 [开发 SOP](docs/开发SOP.md) 和 [上线准备清单](docs/上线准备清单.md)。

图标原稿 `build/icon.svg`；ICO 内含 16、32、48、256 尺寸。核心逻辑附中文注释。

本版本不内置 Plane 服务，Plane 为可选外部 API 来源；目前单向导入，不回写远端；未包含 AI/RAG 和商业签名。
