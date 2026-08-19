# DeepSeek Harness 桌面版

把 DeepSeek Harness（`@deepseek-ai/dsh`）的官方 Web UI 封装成**原生 Windows 桌面应用**，
无需浏览器、无需 npx、无需系统 Node —— 双击即可运行，是一个自包含的桌面程序。

## 目录结构

```
D:\deepseek harness\
├── main.js            # Electron 主进程（启动 dsh web、自动选端口、开窗口）
├── package.json       # 工程描述与依赖
├── package.js         # 打包脚本（已配置 npmmirror 镜像与缓存）
├── start.bat          # 开发态一键启动（等价于 node_modules\.bin\electron .）
├── node_modules\      # electron 运行时 + @deepseek-ai/dsh 及全部插件
├── runtime\node\      # 自带的便携版 Node（node.exe），运行 dsh 用
├── data\              # ★ 用户数据目录（DSH_HOME）：会话、设置、凭据、profile 都在这里
└── dist\              # 打包产物：dist\DeepSeek Harness-win32-x64\DeepSeek Harness.exe
```

## 数据存储位置

用户数据全部保存在 **`D:\deepseek harness\data`**（对应 Harness 的 `DSH_HOME`）：

- `data\settings.yaml`、`data\.credentials.yaml` —— 设置与 API 凭据
- `data\profiles\web\` —— web profile（首次启动由 dsh 自动初始化）
- `data\profiles\node_modules\` —— 插件回退链接（dsh 启动时自动生成）
- `data\sessions\` —— 历史会话
- `data\storages\` —— 工作区/投影缓存

> 默认目录在 `main.js` 顶部的 `DEFAULT_DATA_DIR` 常量里，可通过环境变量 `DSH_HOME` 覆盖。

## 使用方式

### 方式一：开发态启动（源码运行）

```bat
start.bat
```

### 方式二：独立 exe（“完整应用版本”，已生成）

双击 `dist\DeepSeek Harness-win32-x64\DeepSeek Harness.exe` 即为独立桌面应用（无需 Node/npm）。

如需重新打包（例如改了 `main.js`）：

```bat
npm run package
```

## 行为说明

- **单实例**：重复启动会聚焦已有窗口，不会重复开服务。
- **端口**：每次启动自动选用一个空闲端口，避免与浏览器里已运行的 Harness（默认 3080）冲突。
- **退出**：关闭窗口即结束本应用自带的 dsh 进程，不影响浏览器里的实例。
- **外部链接**：在系统默认浏览器中打开。
