# 保姆级安装教程 · dsh-zh-review-guard

这一页写给**目标电脑**（不是开发机）：你只想把这个插件装上，不想研究它怎么写的。
全程约 5 分钟，只需要复制粘贴几条命令。

- 先想知道"这插件到底干什么" → 看 [README.md](./README.md)
- 只看命令的三行版 → 跳到 **第 2 步**（下载）和 **第 6 步**（安装）

**不需要**：Git、Node.js、pnpm、VS Code、管理员权限、科学上网（有替代路径）。
**需要**：一台装了 DeepSeek Harness 的 Windows 电脑。

---

## 目录

1. [开始之前](#1-开始之前)
2. [第 1 步：确认 `dsh` 命令能用](#第-1-步确认-dsh-命令能用)
3. [一条命令装完（推荐）](#一条命令装完推荐)
4. [第 2 步：下载安装包](#第-2-步下载安装包)
5. [第 3 步：核对文件（强烈推荐）](#第-3-步核对文件强烈推荐)
6. [第 4 步：决定装进哪个 profile](#第-4-步决定装进哪个-profile)
7. [第 5 步：关掉 DSH App](#第-5-步关掉-dsh-app)
8. [第 6 步：安装](#第-6-步安装)
9. [第 7 步：确认装上了](#第-7-步确认装上了)
10. [第 8 步：重启 DSH App](#第-8-步重启-dsh-app)
11. [第 9 步：验证真的生效](#第-9-步验证真的生效)
12. [第 10 步（可选）：离线自检](#第-10-步可选离线自检)
13. [卸载](#卸载)
14. [故障排查](#故障排查)
15. [手动安装（连 pnpm 都用不了时）](#手动安装连-pnpm-都用不了时)
16. [附录 A：这个包会动哪些文件](#附录-a这个包会动哪些文件)
17. [附录 B：命令速查表](#附录-b命令速查表)

---

## 1. 开始之前

先在键盘上按 `Win + X`，然后点菜单里的「**终端**」或「**Windows PowerShell**」。
接下来所有命令都粘贴到这个窗口里，**每粘贴一行按一次回车**。

> 提示：在 PowerShell 窗口里点右键就是粘贴（`Ctrl+V` 也可以）。

---

## 第 1 步：确认 `dsh` 命令能用

```powershell
dsh --help
```

**应该看到**一屏用法说明，其中会有这样一行：

```
dsh plugin --profile <name> <pnpm-args...>
```

看到它就说明 `dsh` 已经注册到命令行，可以继续。

**如果看到**类似 `dsh : 无法将"dsh"项识别为 cmdlet、函数、脚本文件或可运行程序的名称` →
去做 [故障排查 A](#a-dsh-命令找不到)，解决后再回来。

---

## 一条命令装完（推荐）

**只要机器能访问 GitHub，装这个插件就只需要一行命令** —— 下载、核对哈希都交给 `dsh plugin add` 自己做。

网络不通时才需要先设代理（端口换成你自己的）：

```powershell
$env:HTTPS_PROXY='http://127.0.0.1:7897'
```

然后二选一：

```powershell
# 方式 A1：走 git 源，pin 住版本 tag（实测约 11 秒；要求机器上装了 git）
dsh plugin --profile desktop add github:ROBOHAPPYIY/dsh-zh-review-guard#v0.2.2

# 方式 A2：直接拉 Release 附件（不需要 git；实测约 40 秒）
dsh plugin --profile desktop add https://github.com/ROBOHAPPYIY/dsh-zh-review-guard/releases/download/v0.2.2/dsh-zh-review-guard-0.2.2.tgz
```

把 `desktop` 换成你的 profile 名（Web GUI 用 `web`；不确定就先读[第 4 步](#第-4-步决定装进哪个-profile)）。

**应该看到**（方式 A1 的实测输出）：

```
+ dsh-zh-review-guard github:ROBOHAPPYIY/dsh-zh-review-guard#v0.2.2

Packages: +1
Progress: resolved 1, reused 0, downloaded 1, added 1, done
Done in 11.4s using pnpm v11.7.0
```

看到 `Done in ... using pnpm` 就是装好了（`dsh plugin add` 会自动把包名写进 `dsh.profile.bundles`，**不需要手工改任何文件**）。接着跳到 **[第 7 步：确认装上了](#第-7-步确认装上了)**，再按[第 8 步](#第-8-步重启-dsh-app)重启 App 即可。

> **为什么写 `#v0.2.2`**：`github:用户/仓库#tag` 里 `#` 后面是 tag；pin 住 tag 才能保证每次装到的都是同一份代码。不写 tag 会装 `main` 分支的最新提交。以后升级就是把这一行里的版本号换成新版号再跑一次。
>
> **方式 A1 的前提**：命令里能找到 `git`（`git --version` 有输出就行）。机器上没有 git 就用方式 A2，或者走下面的离线安装。

---

## 第 2 步：下载安装包

> 已经用上面的「一条命令装完」装好的话，第 2、3、5、6 步都可以跳过 —— 那几步是给**网络不通、没有 git、或者想先核对哈希**的场景准备的。

### 办法一：用浏览器下载（第一次装推荐这个）

1. 打开 Release 页面：
   **https://github.com/ROBOHAPPYIY/dsh-zh-review-guard/releases/tag/v0.2.2**
2. 页面往下滚到 **Assets**，点 **`dsh-zh-review-guard-0.2.2.tgz`** 下载。
3. 保存到一个**不会随手清空的目录**，例如先新建 `D:\dsh-plugins\`，把文件放进去。

> ⚠️ 记住这个位置：**装完之后这个 tgz 不能删、也不能挪**（原因见 [故障排查 D](#d-装完之后-packagejson-里的-tgz-路径失效)）。

### 办法二：用命令行下载

```powershell
mkdir D:\dsh-plugins -Force
cd D:\dsh-plugins
Invoke-WebRequest "https://github.com/ROBOHAPPYIY/dsh-zh-review-guard/releases/download/v0.2.2/dsh-zh-review-guard-0.2.2.tgz" -OutFile .\dsh-zh-review-guard-0.2.2.tgz
```

**如果它卡住不动、或者报 `Unable to connect` / 超时** —— 这是网络到 GitHub 不通，三条替代路，任选一条：

```powershell
# 路线 1：走你本机的代理（把端口改成你自己的；Clash/V2Ray 常见 7890 / 7897）
$env:HTTPS_PROXY='http://127.0.0.1:7897'
Invoke-WebRequest "https://github.com/ROBOHAPPYIY/dsh-zh-review-guard/releases/download/v0.2.2/dsh-zh-review-guard-0.2.2.tgz" -OutFile .\dsh-zh-review-guard-0.2.2.tgz

# 路线 2：用镜像前缀（把 ghfast.top/ 加在原始链接前面）
Invoke-WebRequest "https://ghfast.top/https://github.com/ROBOHAPPYIY/dsh-zh-review-guard/releases/download/v0.2.2/dsh-zh-review-guard-0.2.2.tgz" -OutFile .\dsh-zh-review-guard-0.2.2.tgz
```

路线 3：在能上网的电脑上下好这个 tgz，用 U 盘/网盘拷过来。
**tgz 是自包含的**——拷过去照样能装，不需要源码、不需要联网装依赖。

---

## 第 3 步：核对文件（强烈推荐）

```powershell
Get-FileHash .\dsh-zh-review-guard-0.2.2.tgz -Algorithm SHA256
```

**应该看到**（`Hash` 列要一模一样，大小写无所谓）：

```
Algorithm       Hash                                                                   Path
---------       ----                                                                   ----
SHA256          803C38D6768620D861ECB833A4143CC94574322A07B57BA576AA1B635224E368       D:\dsh-plugins\...
```

参考信息：

| 项 | 值 |
| --- | --- |
| 文件名 | `dsh-zh-review-guard-0.2.2.tgz` |
| 大小 | 39077 字节（约 38.2 KB） |
| SHA256 | `803C38D6768620D861ECB833A4143CC94574322A07B57BA576AA1B635224E368` |

**对不上就别装**——重新下载一次；再对不上请到仓库的 Issues 里说一声。

---

## 第 4 步：决定装进哪个 profile

DSH 用 **profile** 来存一整套配置，常见的有两个：

| 你平时怎么用 DSH | 装进哪个 profile |
| --- | --- |
| 桌面客户端（一个独立窗口的 App） | `desktop` |
| 浏览器里的 Web GUI | `web` |

- **不确定就用 `desktop`。**
- 两个都用？那就两个 profile 各跑一遍第 6 步的安装命令，互不影响。

想先确认这个 profile 真的存在，可以跑（会刷很久配置，看到内容就说明没问题）：

```powershell
dsh --profile desktop --dump-config
```

---

## 第 5 步：关掉 DSH App

安装过程会改 profile 目录里的 `package.json` 和 `node_modules`，**装的时候别让 App 开着**：

1. 关掉所有 DSH 窗口；
2. 如果它常驻托盘，右键托盘图标 → 「退出 / Quit」。

---

## 第 6 步：安装

```powershell
dsh plugin --profile desktop add "D:\dsh-plugins\dsh-zh-review-guard-0.2.2.tgz"
```

把两个地方换成你自己的：`desktop` → 你第 4 步选的 profile；`D:\dsh-plugins\...` → 你第 2 步实际保存的路径（路径带空格也没关系，因为外面有引号）。

**应该看到**（本机实测输出，速度视机器而定）：

```
Packages: +1
+
Progress: resolved 1, reused 0, downloaded 1, added 1, done

Done in 306ms using pnpm v11.7.0
```

**如果看到** `SyntaxError: Unexpected token ... is not valid JSON` →
去做 [故障排查 B](#b-syntaxerror-unexpected-token--is-not-valid-json)，解决后重跑这条命令。

---

## 第 7 步：确认装上了

```powershell
dsh --profile desktop --dump-config | Select-String "zh-review-guard"
```

**应该看到**（关键是第一行 `# == dsh-zh-review-guard`）：

```
# == dsh-zh-review-guard
- id: dsh-zh-review-guard
  name: dsh-zh-review-guard
```

再核对一下 profile 自己的记录（可选）：

```powershell
Get-Content "$env:USERPROFILE\.dsh\profiles\desktop\package.json"
```

**应该看到**里面多了两项（`dependencies` 里的那一条、以及 `bundles` 数组里的 `dsh-zh-review-guard`）：

```json
{
  "dependencies": {
    "dsh-zh-review-guard": "file:D:/dsh-plugins/dsh-zh-review-guard-0.2.2.tgz"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "dsh-zh-review-guard"
      ]
    }
  }
}
```

> 你不用手工往 `package.json` 里加任何东西 —— `dsh plugin add` 会自动把包名写进 `dsh.profile.bundles`。

---

## 第 8 步：重启 DSH App

**这一步不能省。** profile 的 bundle 层栈只在 App 启动时装配，装完不重启不会生效。

完全退出 App（含托盘）→ 重新打开。

---

## 第 9 步：验证真的生效

### 9.1 看装配日志（最客观的证据）

重启后随便开一个会话，然后跑：

```powershell
Get-Content "$env:USERPROFILE\.dsh\zh-review-guard\status.json"
```

**应该看到**（数值只是示例，关键看三条）：

```json
{
  "plugin": "dsh-zh-review-guard",
  "version": "0.2.2",
  "instanceId": "1a2b3c4d",
  "pid": 12345,
  "startedAt": "2026-10-02T07:30:00.000Z",
  "rulesChars": 618,
  "rulesHash": "……",
  "assemblies": 3,          ← ① 大于 0，而且随着你用 DSH 继续增长
  "sessions": 1,
  "appends": 1,
  "replaces": 2,
  "hookErrors": 0,          ← ② 应该是 0
  "lastAt": "……",
  "lastSessionId": "……",
  "lastAction": "replace",
  "lastSectionCount": 12,                              ← ③ 段数量应 ≥ 1
  "lastSectionNamesHash": "9f2c…",                     ← ③ 默认不再写完整清单；想看段名就把 recordSectionNames 设为 true
  "agentsFile": { "path": "……\\.dsh\\AGENTS.md", "owned": true, "ownedBy": "state-hash", "reason": "unchanged", "userContentKept": false, "backup": null, "syncedAt": "……", "error": null, "digestLines": 2, "digestChars": 210 }
}
```

同一个目录下还有：

- `assemblies.jsonl` —— 每次装配一行，能看到"哪个会话、做了追加还是替换、段数量 `sectionCount` 与段名哈希 `sectionNamesHash`"
- `instances\<id>.json` —— 每个插件实例各自一份计数（两个实例时用这个看总量）
- `agents-state.json` / `backups\` —— 插件对 `AGENTS.md` 的所有权哈希，以及覆盖前的备份

**如果这个目录根本不存在** → 插件一次都没被调用过，去做 [故障排查 C](#c-装完了但看起来没生效)。

### 9.2 肉眼看一眼系统提示词

随便开个新会话，系统提示词里应该多出这样一段（这是插件注入的常驻 section）：

```
<!-- managed-by: dsh-zh-review-guard v0.2.2 -->
# 用户全局护栏（dsh-zh-review-guard 插件自动写入 / 每会话注入）
...
```

### 9.3 顺带发生的事

插件会把规则同步进 `C:\Users\<你的用户名>\.dsh\AGENTS.md`。**默认只写精简兜底版**（内置规则前 2 条，约 460 字节 / 7 行，`agentsDigestLines` 可调、设 `0` 则写整份正文）—— 完整规则由系统提示词注入，这里只是上游把整段替换掉时的兜底。
**只有这几种情况它会写**：这个文件不存在（或只有空白），或者文件内容与 `zh-review-guard\agents-state.json` 里记录的"上次写入哈希"一致（本插件自己写的，规则变了会就地更新），或者文件全文就是本插件的文本、只是 `managed-by` 标记里的版本号不同（完整正文或任意条数的精简兜底版都算，老版本、或换过 `agentsDigestLines` 留下的文件）。
你自己手写的 `AGENTS.md` 不会被覆盖 —— 这一点记录在 `status.json` 的 `agentsFile.owned` / `agentsFile.ownedBy` 里（`owned: false` = 它没动手）。确实需要覆盖时，会先把原文件备份到 `zh-review-guard\backups\`（默认保留 5 份，`agentsBackupKeep` 可调）。本次写入的是全文还是兜底版、多少字符，记在 `status.json` 的 `agentsFile.digestLines` / `agentsFile.digestChars` 里。

---

## 第 10 步（可选）：离线自检

这一步不依赖 DSH，只是验证包本身完好：

```powershell
mkdir $env:TEMP\zhg-check -Force
tar -xzf D:\dsh-plugins\dsh-zh-review-guard-0.2.2.tgz -C $env:TEMP\zhg-check
node "$env:TEMP\zhg-check\package\test\selftest.mjs"
```

**应该看到**：

```
75/75 passed
```

> 这一步需要机器上有 `node`。DSH 自带的 node 就行；实在没有，跳过这一步也不影响安装。
> v0.2.2 起自测共 75 项（看到 `75/75 passed` 同理；v0.2.0 是 57 项、v0.2.1 是 67 项）；只要没有 `FAIL` 行就算过。

---

## 卸载

```powershell
# 1) 先关掉 DSH App（含托盘）
# 2) 移除插件：它会自动清掉 profile package.json 里的依赖项与 bundles 项
dsh plugin --profile desktop remove dsh-zh-review-guard

# 3) 按需清理插件之外的两处残留：
#    - C:\Users\<你的用户名>\.dsh\AGENTS.md
#      删掉带 <!-- managed-by: dsh-zh-review-guard v0.2.2 --> 标记的那段
#      （或只删掉标记那一行，插件以后就不会再认领这个文件）
#    - C:\Users\<你的用户名>\.dsh\zh-review-guard\
#      纯观测数据（status.json / assemblies.jsonl / instances\ / agents-state.json / backups\），留删随意

# 4) 重新启动 App
```

`dsh plugin add` 当初往 `package.json` 里加了两项，`remove` 会把这两项都清掉（`bundles` 回到 `[]`），`node_modules` 里的 junction 也一并删除 —— **不需要你手工改 `package.json`**。

---

## 故障排查

### A. `dsh` 命令找不到

**现象**

```
dsh : 无法将"dsh"项识别为 cmdlet、函数、脚本文件或可运行程序的名称。
请检查名称的拼写，如果包括路径，请确保路径正确，然后再试一次。
```

**原因**：DSH 安装时没把 `dsh` 注册进 PATH，或者你是在环境变量变更**之前**打开的终端。

**处理**

1. 关掉 PowerShell 窗口，重新开一个，再试 `dsh --help`。
2. 还不行，直接用绝对路径调用（能出结果说明只是 PATH 没配好）：

   ```powershell
   & "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" --help
   ```

   把 `bin` 所在目录加进用户 PATH：`Win + R` → `sysdm.cpl` → 高级 → 环境变量 → 用户变量里的 `Path` → 新建一行填进去 → 确定 → **重开终端**。
3. 连绝对路径都没有那个文件：重新安装一次 DSH。

### B. `SyntaxError: Unexpected token ... is not valid JSON`

**现象**（完整报错长这样）

```
SyntaxError: Unexpected token '﻿', "﻿{"name":""... is not valid JSON
    at JSON.parse (<anonymous>)
    at readProfileManifest (@deepseek-ai/dsh-app-boot/lib/index.js:835:22)
    at runProfilePnpm (@deepseek-ai/dsh-plugin-manager/lib/types/operations.js:262:20)
```

**原因**：`C:\Users\<你的用户名>\.dsh\profiles\<profile>\package.json` 带了 **UTF-8 BOM**（文件开头多了 3 个看不见的字节）。DSH 用 `JSON.parse` 读它，BOM 会让解析直接失败。

**处理**：用下面这段把同一个文件重写成「UTF-8 无 BOM」，然后重跑安装命令：

```powershell
$p = "$env:USERPROFILE\.dsh\profiles\desktop\package.json"
$json = Get-Content $p -Raw
[System.IO.File]::WriteAllText($p, $json, (New-Object System.Text.UTF8Encoding($false)))
```

**以后怎么避免**：别用记事本「另存为 UTF-8」（旧版记事本会加 BOM）；用 VS Code 时选 `UTF-8`，不要选 `UTF-8 with BOM`。

### C. 装完了但看起来没生效

按顺序排查，第一条最常见：

1. **重启 App 了吗？** profile 的 bundle 层栈只在启动时装配 —— 忘了重启是最常见的原因。
2. **装对 profile 了吗？**
   ```powershell
   dsh --profile desktop --dump-config | Select-String "zh-review-guard"
   ```
   没输出说明装到别的 profile 去了，去那个 profile 里重装。
3. **观测目录存在吗？** `C:\Users\<你的用户名>\.dsh\zh-review-guard\status.json` 在不在，`hookErrors` 是不是 `0`。
4. **是不是还有旧进程活着？** 托盘退出后，用任务管理器确认没有残留的 `DeepSeek Harness.exe`，再启动。
5. **规则段被上游预设整体替换了？** 这是已知情况，插件用第二条通道（`AGENTS.md` 基线）兜底，首轮也应该能看到规则；README 的「为什么必须准备第二条通道」一节讲了原因。注意兜底版只含**内置**规则的前 N 条（默认 2），你在 `rules.md` 里追加的自定义规则不进兜底 —— 要么把 `agentsDigestLines` 设为 `0`（写整份正文），要么就靠通道 1。

### D. 装完之后 package.json 里的 tgz 路径失效

**现象**：以后跑 `dsh plugin --profile desktop install` 报找不到 tgz 文件。

**原因**：安装后 `<profile>\package.json` 里记的是 **tgz 的绝对路径**（`file:D:/dsh-plugins/....tgz`）。你把那个 tgz 删了或者挪走了。

**处理**：把 tgz 放回原位置；或者改 `package.json` 里那条路径指向新位置，再跑一次

```powershell
dsh plugin --profile desktop install
```

### E. 下载一直失败

回到 [第 2 步](#第-2-步下载安装包) 的三条路：本机代理 → 镜像前缀 → 换台机器下载后拷过来。

### F. `status.json` 里出现两个实例 / `instances\` 里有两个文件

**这是正常现象**，不是装重了。开发机热装配（`dev_install_package`）和 patch 层会各起一个实例，两者用**同名 section + 就地替换**，系统提示词里最终只有一段。
证据：`hookErrors: 0` 且 `replaces` 大于 0。你只用 `dsh plugin add` 安装的话，通常只有一个实例。

### G. 想确认到底有没有"真的"注入

看 `assemblies.jsonl` 里最新一行的 `sectionCount`（≥ 1）与 `sectionNamesHash` —— 默认不写完整段名清单（降低信息暴露面）；想直接看到 `zh-review-guard` 这个名字，把配置里的 `recordSectionNames` 设为 `true`，再触发一次装配。

### H. 装好了，但怎么知道"主通道"没悄悄失效？

这是 v0.2.0 专门解决的问题。上游如果改了事件名或瀑布契约，`ctx.on('system-prompt/assemble', …)` 会**静默失效**：插件不报错、`status.json` 看着健康、通道 2 还在兜底 —— 于是"看起来装了，其实主通道已经死了"。

现在有两条客观证据：

```powershell
# 1) 契约自检：registerOk=false 或 error 非空 = 注册当场就失败了
(Get-Content "$env:USERPROFILE\.dsh\zh-review-guard\status.json" -Raw -Encoding UTF8 | ConvertFrom-Json).contract | Format-List

# 2) 健康心跳：stale=true = 世界在动、主通道却一次都没被调用
Get-Content "$env:USERPROFILE\.dsh\zh-review-guard\health.json" -Raw -Encoding UTF8
```

`health.json` 里 `level` 的含义：

| level | 含义 | 你要做什么 |
| --- | --- | --- |
| `ok` | 有新的装配记录，主通道在工作 | 无需处理 |
| `idle` | 还没有会话活动（刚装完就是这样） | 开一个会话再看 |
| `warming` | 启动宽限期内（`staleGraceMs`，默认 2 分钟） | 等一会儿再看 |
| `stale` | **疑似失效**：加载之后出现了新会话，却零装配 | 看 `reasons` 与 App 日志里的 `主通道疑似失效` 警告；把 `status.json` 的 `contract`、`hookErrors` 一起贴出来排查 |

判定依据（`health.json` 的 `sessionsSeen`）：插件扫描 `$DSH_HOME\sessions\<工作区>\<会话id>\` 的目录创建时间，新会话目录出现即"世界确实在动"的客观证据；此时装配数仍为 0，才判 `stale`。所以刚装完、还没人用 DSH 的机器**不会误报**。

---

## 手动安装（连 pnpm 都用不了时）

```powershell
# 1) 解压到稳定目录
tar -xzf D:\dsh-plugins\dsh-zh-review-guard-0.2.2.tgz -C $env:TEMP\zhg-manual
Move-Item $env:TEMP\zhg-manual\package D:\dsh-plugins\dsh-zh-review-guard

# 2) 手工编辑 C:\Users\<你的用户名>\.dsh\profiles\desktop\package.json
#    （切记：不能带 BOM，见故障排查 B）
#    在 "dependencies" 里加一项：
#       "dsh-zh-review-guard": "file:D:/dsh-plugins/dsh-zh-review-guard"
#    在 "dsh" → "profile" → "bundles" 数组里加一项：
#       "dsh-zh-review-guard"

# 3) 让 pnpm 把依赖链起来（纯本地操作，不访问 registry）
dsh plugin --profile desktop install

# 4) 重启 App
```

> 如果目标机装了 `dsh-super-injector`，也可以让 agent 用 `dev_install_package D:\dsh-plugins\dsh-zh-review-guard` 热装（免重启，双路径：loader.create + patch 层）。

---

## 附录 A：这个包会动哪些文件

| 位置 | 安装时 | 运行时 |
| --- | --- | --- |
| `<profile>\package.json` | 增加 `dependencies` 与 `dsh.profile.bundles` 各一项 | — |
| `<profile>\node_modules\dsh-zh-review-guard` | 交给 pnpm 摆放：`file:` / `github:` / 附件 URL 这些来源是**解包出的真实目录**，`link:` 来源是**符号链接**（**不要手改这里**，卸载走 `dsh plugin remove`） | — |
| `C:\Users\<你>\.dsh\zh-review-guard\` | — | 写 `status.json`、`health.json`、`assemblies.jsonl`（超过 `maxLogBytes` 轮转为 `.1`）、`instances\<id>.json`、`agents-state.json`、`backups\<时间戳>.bak`、卸载时写 `disposed.json` |
| `C:\Users\<你>\.dsh\zh-review-guard\rules.md` | — | **你的**追加规则（只在存在时读；插件不会创建、也不会改它） |
| `C:\Users\<你>\.dsh\AGENTS.md` | — | 只在"文件不存在/为空"、"内容与 `agents-state.json` 记录的哈希一致"或"全文就是本插件的文本（完整正文、或任意条数的精简兜底版，仅版本号不同）"时写入（默认写 `agentsDigestLines` 条内置规则的精简兜底版）；覆盖前先备份到 `backups\` |

**不会**：联网、写注册表、动系统环境变量、动 App 自己的安装目录。

## 附录 B：命令速查表

| 想干什么 | 命令 |
| --- | --- |
| 看 DSH 能不能用 | `dsh --help` |
| **一键安装（推荐）** | `dsh plugin --profile desktop add github:ROBOHAPPYIY/dsh-zh-review-guard#v0.2.2` |
| 一键安装（没有 git / 不想走 git） | `dsh plugin --profile desktop add https://github.com/ROBOHAPPYIY/dsh-zh-review-guard/releases/download/v0.2.2/dsh-zh-review-guard-0.2.2.tgz` |
| 升级到新版本 | 把上面命令里的 `v0.2.2` 换成新版本号再跑一次 |
| 下载（离线安装用） | `Invoke-WebRequest "<Release 附件直链>" -OutFile .\dsh-zh-review-guard-0.2.2.tgz` |
| 核对完整性 | `Get-FileHash .\dsh-zh-review-guard-0.2.2.tgz -Algorithm SHA256` |
| 安装 | `dsh plugin --profile desktop add "D:\dsh-plugins\dsh-zh-review-guard-0.2.2.tgz"` |
| 确认装上了 | `dsh --profile desktop --dump-config \| Select-String "zh-review-guard"` |
| 看生效证据 | `Get-Content "$env:USERPROFILE\.dsh\zh-review-guard\status.json" -Raw -Encoding UTF8` |
| 看主通道健康 | `Get-Content "$env:USERPROFILE\.dsh\zh-review-guard\health.json" -Raw -Encoding UTF8` |
| 写自己的规则 | 编辑 `$env:USERPROFILE\.dsh\zh-review-guard\rules.md`（改完约 1 分钟内热更新，不用重启） |
| 卸载 | `dsh plugin --profile desktop remove dsh-zh-review-guard` |
| 离线自检 | `node .\package\test\selftest.mjs`（解压 tgz 之后） |

## 版本与兼容性

- `engines`：`node >= 22`（DSH 自带的 node 满足）、`dsh >= 0.0.1-rc`
- 零第三方依赖、没有编译步骤：tgz 拷过去即可用，不需要 npm 源、不需要联网
- 本教程按 Windows 写；Linux/macOS 把路径换成对应写法即可（`$DSH_HOME` 默认 `~/.dsh`）

| 版本 | 这一版多了什么 |
| --- | --- |
| v0.1.0 / v0.1.1 | 两条独立通道、配置项、可观测日志；MIT 许可；保姆级教程 |
| v0.2.0 | **规则可配置**（`rulesMode` / `rulesFile` / `rulesMaxChars`）；**主通道健康检查**（`health.json`）与**契约自检**（`status.json` 的 `contract`）；自测 57 项 |
| v0.2.1 | **接管判据收紧 + 覆盖前备份**（`agents-state.json` 记录所有权哈希；`backups\` 默认留 5 份）；**磁盘卫生**（`assemblies.jsonl` 按 `maxLogBytes` 轮转、`instances\` 按 TTL 与数量清理）；**降低暴露面**（默认只记段数量与哈希，`recordSectionNames` 可开）；自测 67 项 |
| v0.2.2 | **通道 2 减重**：`AGENTS.md` 默认只写精简兜底版（`agentsDigestLines`，默认前 2 条内置规则，约 460 字节），完整规则仍由系统提示词注入 —— 每轮护栏开销从约 1076 tokens 降到约 721（省 1/3）；设 `0` 可恢复整份全文；自测 75 项 |

**从旧版本升级**：把一键安装命令里的 tag 换成新版本号再跑一次，然后重启 App。`AGENTS.md` 的认领先比 `agents-state.json` 里记录的哈希（本插件自己写过的内容），再比全文是否就是本插件的文本（只差版本号也算）—— 所以 v0.2.0 及更老版本写下的文件仍会被认领并就地升级，不会出现"文件里还是旧规则、插件却以为那是你手写的、于是停止同步"。注意 v0.2.1 起**取消了"只要带前缀标记就整文件覆盖"**的旧行为：只有确实属于本插件的文件才会被改写，且改前会备份。

v0.2.2 起 `AGENTS.md` 默认写成**精简兜底版**（前 2 条内置规则）。升级后旧的全文本文件会在下一次同步时被认领并改写成兜底版（改前备份到 `backups\`）；想继续保留整份正文，把 `agentsDigestLines` 设为 `0`。

## 本机复验记录（v0.2.0 发布时留下的事实）

用**从 Release 下载回来的那份 tgz**（不是本地原文件）复验过：

- `28 166 bytes`，SHA256 与上表逐字符一致；
- 解包后 `node test/selftest.mjs` → `57/57 passed`；
- 在一个**全新的空白 profile** 上 `dsh plugin --profile <p> add <tgz>` → `exit=0`；
- `dsh --profile <p> --dump-config` 里出现 `# == dsh-zh-review-guard` 层，且 `<profile>\package.json` 自动写入 `dependencies` 与 `dsh.profile.bundles` 两项；
- 复验用的临时 profile 已删除，没有留在你的 `profiles\` 目录里。

### v0.2.0 安装链路复检（三条路各走一遍）

在三个**全新空白 profile** 上各装一次，装完检查同一组事实：

| 安装方式 | 结果 | 耗时 | 写进 `dependencies` 的值 |
| --- | --- | --- | --- |
| 离线：`add <本地 tgz>` | `exit=0` | 322 ms | `file:D:/.../dsh-zh-review-guard-0.2.0.tgz` |
| 一键：`add github:ROBOHAPPYIY/dsh-zh-review-guard#v0.2.0` | `exit=0` | 13.8 s | `github:ROBOHAPPYIY/dsh-zh-review-guard#v0.2.0` |
| 一键：`add <Release 附件 URL>` | `exit=0` | 3.1 s | 该附件 URL |

三种方式装完，检查结果**完全一致**：

- `<profile>\package.json` 自动写入 `dependencies` 一项，并把包名追加进 `dsh.profile.bundles`；
- `<profile>\node_modules\dsh-zh-review-guard\` 下文件齐全：`lib`、`test`、`cordis.patch.yml`、`INSTALL.md`、`LICENSE`、`package.json`、`README.md`（与 tgz 内容一致）；
- 包内 `node test/selftest.mjs` → `57/57 passed`，`exit=0`；
- `dsh --profile <p> --dump-config` 里出现该 bundle 层（有 3 行提到 `dsh-zh-review-guard`）。

再在**一个隔离的 `DSH_HOME`（全新目录）**里从零装一遍并真正启动一次：插件在 boot 阶段即被挂载 —— 该目录下自动出现 `AGENTS.md`（1562 bytes，首行 `<!-- managed-by: dsh-zh-review-guard v0.2.0 -->`）与 `zh-review-guard\status.json`（`version=0.2.0`、`hookErrors=0`、`contract={onAvailable:true, registerOk:true}`）。复检后临时 profile 与隔离 `DSH_HOME` 都已删除。

> 一处未覆盖（诚实说明）：本机 profile 的 app 是 Web UI，`dsh ... headless` 不是它的参数，所以"从 Release 装的副本在一次完整 LLM 会话里被装配"没有单独跑通；该结论由上面的 boot 挂载证据 + 本机真实运行证据（`status.json` 的 `assemblies` 递增、`lastSectionNames` 含 `zh-review-guard`）共同支撑。

### v0.2.1 复检（2026-10-02 发布后）

v0.2.1 是一次安全加固版，改动集中在 `lib/index.js` 与自测里：

- **接管判据收紧**：`AGENTS.md` 只在①不存在/为空、②内容与 `zh-review-guard\agents-state.json` 记录的哈希一致、③全文就是本插件文本（仅版本号不同）时才写入；旧行为"带前缀标记就整文件覆盖"已取消 —— 这修掉了"用户文件里只要出现过一次该标记就可能被整份覆盖"的风险。
- **覆盖前备份**：确实要改写时先落到 `zh-review-guard\backups\AGENTS.md.<时间戳>.bak`，默认保留 5 份（`agentsBackupKeep`）。
- **磁盘卫生**：`assemblies.jsonl` 超过 `maxLogBytes`（默认约 2 MB）轮转为 `.1`；`instances\` 按 `instancesTtlMs`（7 天）与 `instancesMaxFiles`（20）清理，当前实例永不删。
- **降低暴露面**：装配日志默认只记 `sectionCount` 与 `sectionNamesHash`，不再逐行写完整段名清单（要写就把 `recordSectionNames` 设为 `true`）。

本机验证（2026-10-02）：

- `node test/selftest.mjs` → `67/67 passed`，`exit=0`（v0.2.0 是 57 项）；
- 另跑一个独立脚本，在**临时 `DSH_HOME`** 里重放四个场景：①含标记片段的用户文件逐字节保留、不产生备份；②只差版本号的旧全文被就地升级、生成备份与 `agents-state.json`；③插件自己写过的内容仍可继续更新（靠状态哈希）；④纯用户手写文件不动 → `VERIFY OK 9/9`；
- 打包产物解包后自测同样 `67/67 passed`；发布后把 Release 附件（35 197 B）下载回来复验，SHA256 = `A6805A63C8CA3A7216C9E1E7BE8A72DB9F9116C7E728352B8764DFEBEC7F77DB`，与本地打包产物逐字节一致。

### v0.2.2 复检（精简兜底版）

v0.2.2 只改通道 2 的**体积**，不改通道 1 的规则文本，也不取消任何保护：

- **默认写精简兜底版**：`agentsDigestLines`（默认 `2`）条内置规则 + 标记 + 一行说明，约 460 字节 / 7 行；设 `0` 写整份正文（v0.2.1 行为）。
- **自己写的文件仍能识别**：接管判据新增"结构识别"——只要文件是"标记 + 标题 + 说明 + 编号规则 1..N"的形状就认定为本插件所有，所以上次写 5 条、这次配 2 条时不会把自己的文件误判成用户内容（这是实现时踩过的坑）。
- **每轮开销**：规则文本 617 字符 ≈ 538 tokens；通道 2 全文 ≈ 538 tokens、兜底版（2 条）≈ 183 tokens → 合计从约 1076 降到约 721（省约 33%），设 `1` 时约 651（省 40%）。

本机验证（2026-10-02）：

- `node test/selftest.mjs` → `75/75 passed`，`exit=0`（v0.2.1 是 67 项）；
- 独立脚本（`audit\zhg-verify-fix.mjs`）→ `VERIFY OK 13/13`：用户手写文件不动、只差版本号的旧文被认领升级、备份命中、状态哈希一致、默认写兜底版、设 `0` 切回全文；
- 用真机 `AGENTS.md`（1562 字节 / 14 行 / 首行 v0.2.0）在临时 `DSH_HOME` 里重放：认领 → 备份（1562 字节原样）→ 改写为 459 字节 / 7 行 / 首行 v0.2.2。