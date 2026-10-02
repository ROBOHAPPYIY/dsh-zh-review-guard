# 在另一台电脑上安装 dsh-zh-review-guard

本文件面向**目标机**（不是开发机）。开发机上用 `dev_install_package` 直接指目录热装，那套命令在别的电脑上没有（那是 agent 工具），所以这里给的是标准 CLI 路径。

## 交付物

| 文件 | 说明 |
| --- | --- |
| `dsh-zh-review-guard-0.1.0.tgz` | 标准 npm 包（`npm pack` 产物），6 个文件：`package.json`、`cordis.patch.yml`、`lib/index.js`、`test/selftest.mjs`、`README.md`、`INSTALL.md` |
| 本文件 | 目标机安装步骤 |

同一个 tgz 也发布在本仓库的 **Releases** 页（发版时上传，附件与源码同源；下载后可用 `Get-FileHash <tgz> -Algorithm SHA256` 与 Release 说明里的值核对）。

零第三方依赖（只用 `node:` 内置模块），**没有编译步骤**，所以 tgz 拷过去即可用，不需要 npm 源、不需要联网。

## 前置条件

1. 目标机已安装 DeepSeek Harness，且命令行里 `dsh --version` 能出结果（DSH 安装时会注册 `dsh` 到 PATH）。
2. 目标机**至少启动过一次 App**，这样 `$DSH_HOME/profiles/<profile>/` 已存在。Windows 上 `$DSH_HOME` 默认是 `C:\Users\<用户名>\.dsh`。
3. 知道要装进哪个 profile：Web GUI 用 `web`，桌面端用 `desktop`。用下面命令确认 profile 存在：
   ```
   dsh --profile <profile> --dump-config
   ```
   装之前建议**先关掉 DSH App**（安装过程会改 profile 的 `package.json` 与 `node_modules`）。

把 tgz 拷到目标机的**稳定目录**（例：`D:\dsh-plugins\`），不要放在临时目录——安装后 `package.json` 会记住它的绝对路径（见「已知坑 2」）。

## 一条命令安装（推荐）

```powershell
dsh plugin --profile <profile> add "D:\dsh-plugins\dsh-zh-review-guard-0.1.0.tgz"
```

`dsh plugin --profile <name> <pnpm-args...>` 把参数透传给该 profile 目录下的 pnpm。实测（在空白 profile 上做的等价实验，pnpm v11.7.0）：

- 输出 `+ dsh-zh-review-guard 0.1.0`，`Done in 304ms`
- `<profile>/package.json` 自动变成：
  ```json
  {
    "dependencies": {
      "dsh-zh-review-guard": "file:D:/dsh-plugins/dsh-zh-review-guard-0.1.0.tgz"
    },
    "dsh": {
      "profile": {
        "bundles": ["dsh-zh-review-guard"]
      }
    }
  }
  ```
- `node_modules/dsh-zh-review-guard` 建为 junction，指向 `node_modules/.pnpm/dsh-zh-review-guard@file+.../node_modules/dsh-zh-review-guard`（tgz 已解包在里面，5 个文件齐全）
- `dsh --profile <profile> --dump-config` 的层栈里出现：
  ```
  > # == dsh-zh-review-guard
  > - id: dsh-zh-review-guard
  >   name: dsh-zh-review-guard
      config: {}
  ```

> **`add` 会自动把包名写进 `dsh.profile.bundles`** —— 手工安装才需要自己加这一项。bundle 层栈在 App 启动时装配，所以装完 **重启 App** 才生效。

装完重启，然后：

## 验证真的装上了

1. 看观测文件 `$DSH_HOME\zh-review-guard\status.json`：`assemblies` 在增长、`hookErrors: 0`、`lastSectionNames` 里含 `zh-review-guard`（同目录 `assemblies.jsonl` 是每次装配一行的合并时间线，`instances\<id>.json` 是每个实例各自的计数）。
2. 新开一个会话，系统提示词里应出现「用户全局护栏（dsh-zh-review-guard 插件自动写入 / 每会话注入）」这一段（本插件把用户需求原文注入为常驻 section，不受上下文压缩影响）。
3. 不依赖 DSH 的离线自检（解压 tgz 后）：
   ```powershell
   tar -xzf dsh-zh-review-guard-0.1.0.tgz -C .\unpacked
   node .\unpacked\package\test\selftest.mjs
   ```
   本机实测输出 `26/26 passed`。

## 手工安装（目标机连 pnpm 都不方便时）

```powershell
# 1. 解压，放到稳定目录
tar -xzf dsh-zh-review-guard-0.1.0.tgz
Move-Item .\package D:\dsh-plugins\dsh-zh-review-guard

# 2. 编辑 $DSH_HOME\profiles\<profile>\package.json（务必无 BOM，见坑 1）：
#    dependencies += { "dsh-zh-review-guard": "file:D:/dsh-plugins/dsh-zh-review-guard" }
#    dsh.profile.bundles += "dsh-zh-review-guard"

# 3. 让 pnpm 把依赖链起来（纯本地操作，不访问 registry）
dsh plugin --profile <profile> install

# 4. 重启 App
```

如果目标机已经装了 `dsh-super-injector`，也可以让 agent 用 `dev_install_package D:\dsh-plugins\dsh-zh-review-guard` 热装（免重启，双路径：loader.create + patch 层）。

## 卸载

```powershell
dsh plugin --profile <profile> remove dsh-zh-review-guard
```

实测（pnpm v11.7.0）：`remove` 会**同时**清掉 `<profile>\package.json` 里的 `dependencies` 项与 `dsh.profile.bundles` 项（bundles 从 `["dsh-zh-review-guard"]` 回到 `[]`），`node_modules` 里的 junction 也一并移除——不需要手工改 `package.json`。剩下要自己决定的是两处**插件外部**的文件：

1. `$DSH_HOME\AGENTS.md`：本插件只会接管**文件不存在**或**带 `<!-- managed-by: dsh-zh-review-guard v0.1.0 -->` 标记**的文件；卸载后想彻底清掉那段规则，删掉该文件即可（或删掉标记那一行，插件就不会再认领它）。
2. `$DSH_HOME\zh-review-guard\`（`status.json` / `assemblies.jsonl` / `instances\`）：纯观测数据，留删随意。

## 已知坑（都是本机实测踩到的）

1. **`<profile>\package.json` 绝对不能带 UTF-8 BOM**。带 BOM 时 `dsh plugin` 直接崩：
   ```
   SyntaxError: Unexpected token '﻿', "﻿{"name":""... is not valid JSON
       at JSON.parse (<anonymous>)
       at readProfileManifest (@deepseek-ai/dsh-app-boot/lib/index.js:835:22)
       at runProfilePnpm (@deepseek-ai/dsh-plugin-manager/lib/types/operations.js:262:20)
   ```
   用 PowerShell 写无 BOM 文件：
   ```powershell
   [System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding($false)))
   ```
   （记事本存「UTF-8」在旧版 Windows 会加 BOM；VSCode 选 UTF-8 即可。）
2. **安装用的 tgz 不要删、不要挪**。安装后 `package.json` 里存的是 `file:` 绝对路径；之后任何一次 `dsh plugin --profile <p> install`（含部分插件的自愈重装）都要能读到它。要挪位置，先改 `package.json` 里的路径再重装。
3. **装完必须重启 App**：profile 的 bundle 层栈在启动时装配；改的是正在被 App 使用的 profile 时，热重载不覆盖 bundle 层。
4. `engines`：`node >= 22`、`dsh >= 0.0.1-rc`。DSH 自带的 node 满足。
5. **双实例是预期行为**：`dev_install_package` 会同时留下 loader.create 运行时条目与 patch 插入项，于是两个实例各写各的 `instances/<id>.json`；两者用**同名 section + 就地替换**，系统提示词里最终只有一段（`hookErrors=0` 且 `replaces>0` 即证据）。只用 `dsh plugin add` 时通常只有 patch 层这一个实例。
