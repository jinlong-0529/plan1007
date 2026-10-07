# 交付工程师个人助手 · 开发与使用 SOP

版本：1.0.0；日期：2026-10-07；目标平台：Windows 10/11 x64。

## 一、安装与首次使用

1. 下载 `DeliveryAssistant-Setup-1.0.0-x64.exe`，核对交付的 SHA256。
2. 双击安装包，进入中文 NSIS 安装向导；按提示选择安装目录，点击“下一步”“安装”“完成”。
3. 桌面和开始菜单将创建“交付工程师个人助手”快捷方式；完成后可直接启动，无需 Node、MySQL 或 Plane。
4. 在“任务”“项目问题”“知识库”“Bug 复盘”分别录入记录。搜索框支持标题、内容、标签、项目等关键词检索。
5. 工作台的“文件与工作总结”支持导入 DOCX、XLSX、Markdown、TXT；单文件不超过 20 MB。旧 DOC/XLS 请先在 Office 中另存为 DOCX/XLSX。扫描件图片文字与 Excel 图片不做 OCR。
6. 日报按当天完成日期汇总任务与解决问题；导出前补充沟通结果、风险和下一步计划。支持 DOCX、Markdown；任务、问题、知识与复盘可导出 XLSX。
7. 点击“备份全部数据”生成含原文件的 JSON 备份。恢复时需确认替换当前数据；恢复前的记录另外保留在数据目录。

## 二、未签名安装包与 SmartScreen

当前交付版未做商业代码签名。从互联网下载的未签名 EXE，首次运行可能显示“Windows 已保护你的电脑”。仅在确认来源可信并核对哈希后，选择 **“更多信息 → 仍要运行”**。

这是 Windows 提供的单次运行操作，不需要关闭 Defender、SmartScreen 或杀毒软件。企业策略或 Smart App Control 可能不提供该按钮；应联系管理员审批，或使用后续签名发行包。

签名并不保证立即消除 SmartScreen 提示；新的发行文件仍需要建立信誉。EV 证书也不再保证首次发行自动获得信誉。

微软依据：[SmartScreen 应用信誉说明](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)。

## 三、本地数据与卸载

桌面数据在 `%APPDATA%\delivery-engineer-assistant\data`，包含 `records.json`、上一版本 `records.json.bak` 和 `attachments` 原文件目录。

安装目录只包含程序。更新或卸载默认保留用户数据；“设置 → 应用 → 已安装的应用”可卸载程序。重新安装将读取原数据。请妥善保管备份，其中可能包含客户信息。应用没有加密本地记录，应使用受控 Windows 账户和系统磁盘加密。

如果数据文件损坏，程序会提示中文错误并保留原文件。先关闭应用并复制整个数据目录作为保全副本，再将可用的 `records.json.bak` 复制为 `records.json`，重新打开并通过“恢复备份”恢复完整备份。勿直接删除客户记录。

## 四、Plane 接入

工作台展开“连接 Plane”，填写服务地址、工作区 slug、项目 UUID、项目名称和 API 密钥。通过公共 API `/api/v1/workspaces/{slug}/projects/{id}/states/` 与 `/issues/` 导入问题快照。

密钥仅在本次连接中驻留内存，不保存；重复导入同一服务、工作区和项目会更新相同问题。状态映射：完成/取消 → 已解决，开始 → 跟进中，其他 → 待确认。本地问题状态变更不会回写 Plane。重新导入会以远端状态覆盖本地快照。

此版是现有交付工作台的 Electron 桌面实现与 Plane API 适配层，没有内置 Plane 服务或 Fork Plane 源码；Plane 仍需独立部署。实际客户实例的网络、权限、版本兼容性需要现场联调。未提供 AI/RAG；当前为关键词检索与基于真实记录的确定性日报。

## 五、开发与重新打包

安装 Node.js 22 LTS 或更高受支持版本、pnpm 11（本次构建工具链使用 Node 24、pnpm 11.19.0）。首次安装和打包需要联网下载 Electron 与 NSIS 工具。

在源码目录打开 PowerShell：

```powershell
pnpm install --frozen-lockfile
pnpm icons
pnpm test
pnpm start
pnpm smoke
pnpm dist
pnpm source
pnpm deliver
```

输出安装包在 `release`，源码包在 `delivery`。`pnpm pack` 生成可直接运行的解包程序目录。`pnpm start:web` 保留原 MySQL Web 原型，需独立配置 `.env.example` 中的环境变量和数据库；桌面版不使用 MySQL。

若默认 Electron 缓存写入失败，可下载与 `package.json` 固定版本一致的 `electron-v40.0.0-win32-x64.zip` 到项目 `.build-cache`，执行 `pnpm runtime`；脚本会验证 Electron 自带的官方 SHA256 后解压到依赖目录。不要跳过校验。网络受限时可临时设置 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`。打包缓存可通过 `ELECTRON_BUILDER_CACHE` 指向项目 `.build-cache/builder`。标准环境优先使用正常安装命令。

本次 Windows 构建还遇到 winCodeSign 压缩包内 macOS 符号链接无法创建的问题。无需修改系统权限，可只解压 Windows 所需工具后再次打包：

```powershell
$env:ELECTRON_BUILDER_CACHE = Join-Path (Get-Location) '.build-cache\builder'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
# 首次 pnpm dist 如因符号链接失败，已下载的压缩包保留在以下目录。
$toolArchive = Get-ChildItem '.build-cache\builder\winCodeSign' -Filter '*.7z' | Select-Object -First 1
& '.\node_modules\.pnpm\7zip-bin@5.2.0\node_modules\7zip-bin\win\x64\7za.exe' x $toolArchive.FullName '-o.build-cache\builder\winCodeSign\winCodeSign-2.6.0' '-xr!darwin' '-xr!linux' -y
pnpm dist
```

此路径适用于锁定的 electron-builder 26.0.12 和当前 lockfile；升级工具版本时，应检查对应工具名称与版本。应用、安装器和卸载图标的写入仍然启用，没有为绕过构建问题关闭资源编辑。

源码入口：`desktop/main.cjs`（窗口与 IPC）、`desktop/preload.cjs`（安全桥）、`desktop/store.cjs`（记录存储）、`desktop/files.cjs`（导入导出）、`desktop/plane.cjs`（Plane 导入）、`index.html`（中文界面）。核心路径附中文注释。

发行版本需先修改 `package.json` 的 version，并同步文档与源码包版本。NSIS 采用向导模式、简体中文、用户级安装，可修改目录；安装、卸载、应用都使用 `build/icon.ico`。图标原始设计在 `build/icon.svg`，`pnpm icons` 生成 16/32/48/256 PNG 与四尺寸 ICO。

固定版本的 node-gyp npm override 用来替换 electron-builder 的 Git 形式传递依赖；应用无本地原生模块且设置 `npmRebuild: false`，不需要编译 node-gyp。若后续引入原生数据库模块，应重新评估 ABI、重建与签名流程。

## 六、代码签名路径

1. 准备一致的发布者身份和应用名称，取得受 Windows 信任的 Authenticode 代码签名证书或配置 Microsoft 的托管签名服务。证书私钥保存在硬件或受控签名服务中。
2. electron-builder 支持证书配置与自定义签名钩子。CI 中使用机密变量注入证书位置和口令，勿写入 Git、源码 ZIP 或 SOP 示例实际值。
3. 对应用主 EXE、安装包及卸载程序执行签名并使用可信时间戳。使用 `Get-AuthenticodeSignature`、Windows SDK `signtool verify /pa /all /v` 验证。
4. 在干净 Windows 虚拟机中测试首次安装、启动、更新和卸载，确认显示正确发布者。
5. 为每次发行生成 SHA256，保持发行身份一致。配置有效的更新与吊销流程。

参考：[electron-builder Windows 配置](https://www.electron.build/win.html)、[NSIS 配置](https://www.electron.build/docs/nsis/)。
