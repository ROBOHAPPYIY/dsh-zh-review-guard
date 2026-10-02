# dsh-zh-review-guard

**让 DSH 的内部思考变成你能看见、能审阅的内容；让面向你的说明始终是简体中文。**

它不是一个"记得写进 `AGENTS.md` 就好"的约定，而是 DeepSeek Harness 的 **bundle 插件**：每个会话装配系统提示词时都会被调用一次，规则以常驻 section 的形式注入，**不受上下文压缩影响**。

[![Release](https://img.shields.io/github/v/release/ROBOHAPPYIY/dsh-zh-review-guard?color=blue&label=release)](https://github.com/ROBOHAPPYIY/dsh-zh-review-guard/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/ROBOHAPPYIY/dsh-zh-review-guard/total?color=brightgreen)](https://github.com/ROBOHAPPYIY/dsh-zh-review-guard/releases)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](./package.json)
[![Self test](https://img.shields.io/badge/self%20test-67%2F67-brightgreen)](./test/selftest.mjs)
[![DSH plugin](https://img.shields.io/badge/DSH-bundle%20plugin-7B68EE)](./cordis.patch.yml)

---

## 没有它的时候

| 痛点 | 后果 |
| --- | --- |
| 内部思考里只有结论，没有目标理解、方案取舍、风险与不确定之处 | 你看到的是"结论凭空出现"，没法复核，也没法在早期纠偏 |
| 思考、权限申请说明、汇报文字中英混杂 | 阅读成本高，专有名词还得自己对照 |
| 靠 `AGENTS.md` 或每次手动叮嘱来约束风格 | 换会话、被上下文压缩、被上游预设整体替换 —— 随时失效，而且**没人察觉** |
| 申请系统级权限（沙箱升级、装依赖、不可逆操作）时不说清要做什么 | 你只能凭信任点"同意" |

## 装上之后

1. **每个会话的系统提示词里都有一段常驻规则**（section 名 `zh-review-guard`），从会话第一轮就在。
2. **"到底有没有生效"不用猜**：每次装配都会写一行观测记录，`status.json` 里有装配次数、替换次数与错误计数。
3. **规则只有一份文本**（`lib/index.js` 的 `RULES_TEXT`），系统提示词 section 与 `AGENTS.md` 都由它生成 —— 不会出现两处文案漂移。

### 它注入的规则

```text
1. 内部思考（reasoning / thinking）一律使用简体中文。
2. 内部思考视为用户可见、需要审阅的内容：给出结论之前，写清目标理解、方案取舍、
   为什么选 A 而不选 B、风险与不确定之处、尚未解决的问题，而不是只给结论。
3. 需要用户拍板或复核的地方（方案选择、不可逆操作、外部审批），明确写出
   「这是需要你确认的点」。
4. 面向用户的说明、汇报、提问、交付说明一律使用简体中文；
   代码、命令、路径、专有名词保留原文。
5. 申请系统级权限（沙箱升级、网络/文件系统访问、安装依赖、审批弹窗）或执行
   不可逆操作前，先用简体中文说明：要做什么、为什么需要、影响范围、是否可回退。
6. 报告结论时附证据（命令、输出、文件路径与行号）；先查证再动手，
   能从代码库或本机查到的客观事实不要反问用户。
7. 能回退的下一步直接做并汇报；只有属于用户的选择（偏好、预算、不可逆操作、
   外部审批）才停下来问。
```

## 安装（约 30 秒）

**前提**：目标机装了 DeepSeek Harness，命令行里 `dsh --version` 有输出。

**最省事是一条命令**（机器能访问 GitHub 就行，不用先下载）：

```powershell
# 走 git 源，pin 住 tag；实测约 11 秒
dsh plugin --profile desktop add github:ROBOHAPPYIY/dsh-zh-review-guard#v0.2.1

# 没有 git / 不想走 git：直接拉 Release 附件
dsh plugin --profile desktop add https://github.com/ROBOHAPPYIY/dsh-zh-review-guard/releases/download/v0.2.1/dsh-zh-review-guard-0.2.1.tgz
```

把 `desktop` 换成你的 profile 名（Web GUI 用 `web`）。网络不通就先设代理：`$env:HTTPS_PROXY='http://127.0.0.1:7897'`。装完同样要**重启 App**。

**离线安装**（先下载、核对哈希、再装）：

```powershell
# 1. 下载（也可在浏览器里点 Release 页的附件）
Invoke-WebRequest "https://github.com/ROBOHAPPYIY/dsh-zh-review-guard/releases/download/v0.2.1/dsh-zh-review-guard-0.2.1.tgz" -OutFile .\dsh-zh-review-guard-0.2.1.tgz

# 2. 核对（可选但推荐）：35197 B / A6805A63C8CA3A7216C9E1E7BE8A72DB9F9116C7E728352B8764DFEBEC7F77DB
Get-FileHash .\dsh-zh-review-guard-0.2.1.tgz -Algorithm SHA256

# 3. 装进你的 profile（Web GUI 用 web，桌面端用 desktop）
dsh plugin --profile desktop add .\dsh-zh-review-guard-0.2.1.tgz
```

**然后重启 DSH App** —— profile 的 bundle 层栈在启动时装配，装完必须重启才生效。

卸载：

```powershell
dsh plugin --profile desktop remove dsh-zh-review-guard
```

完整的**保姆级教程**（下载 → 核对哈希 → 选 profile → 安装 → 重启 → 验证 → 卸载 → 故障排查 A–H）见 **[INSTALL.md](./INSTALL.md)**。

> 零第三方依赖（只用 `node:` 内置模块）、**没有编译步骤**、不联网、不写配置文件之外的位置：tgz 拷过去就能装。仓库里的 tgz 是 `npm pack` 产物，Release 附件与它逐字节一致。

## 工作原理

两条**互相独立**的通道，任一通道生效即可保证规则常驻：

| 通道 | 机制 | 覆盖范围 | 抗压缩 |
| --- | --- | --- | --- |
| 1（主） | `ctx.on('system-prompt/assemble', …)` 瀑布，按 `sectionName` 注入常驻 section `{ name: 'zh-review-guard', order: 4, text: <解析后的规则文本> }` | 每个会话**每次**装配系统提示词 | 是（官方注入点，不走 transcript） |
| 2（备） | 把同一份解析后的规则文本同步到 `$DSH_HOME/AGENTS.md`，由 `@deepseek-ai/dsh-agent-instructions` 在会话**首个 pre-step** 作为持久基线注入 | 会话首轮（含通道 1 被上游整体替换的极端情形） | 是（基线逐轮对账） |

<details>
<summary>为什么必须准备第二条通道？</summary>

某些会话预设（例如本机的 `router-standard`）在「首轮，还没有任何 tool/call」时会**整体替换** `sections`，只保留自己的段。此时通道 1 注入的段会被丢掉 —— 而通道 2 走的是 `AGENTS.md` 基线，不经过那个替换点，因此首轮也一定有规则。

`AGENTS.md` 的接管规则：**只有下列情形之一成立时才写入** —— ①文件不存在或只有空白；②文件内容与本插件记录的"上次写入哈希"一致（`zh-review-guard/agents-state.json`，用于规则文件改动后就地更新）；③文件全文就是本插件的规则文本，只是 `managed-by` 标记里的版本号不同（老版本留下的文件）。你自己手写的 `AGENTS.md` 不会被覆盖；一旦确实要覆盖，**先备份到 `zh-review-guard/backups/`**（默认保留 5 份），判定结果与依据分别记录在 `status.json` 的 `agentsFile.owned` 与 `agentsFile.ownedBy`。
</details>

## 配置

`cordis.patch.yml` 的 `config`，全部可选：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 关掉整个插件 |
| `sectionName` | `zh-review-guard` | 注入的 section 名；同名段**就地替换**（幂等，不会重复追加） |
| `order` | `4` | 段排序（router 用 0–3） |
| `logDir` | `$DSH_HOME/zh-review-guard` | 观测日志目录 |
| `syncAgentsFile` | `true` | 是否同步 `$DSH_HOME/AGENTS.md` |
| `backupAgentsFile` | `true` | 覆盖 `AGENTS.md` 前先把原文件备份到 `<logDir>/backups/` |
| `agentsBackupKeep` | `5` | 备份最多保留几份，超出删最旧 |
| `includeSubagents` | `true` | 子会话是否也注入 |
| `syncIntervalMs` | `60000` | 周期兜底同步间隔（同时也是规则热更新与健康检查的心跳） |
| `rulesMode` | `append` | 规则来源：`append` = 内置 7 条 + 你的追加；`replace` = 完全用你的文件；`off` = 只用内置 |
| `rulesFile` | `$DSH_HOME/zh-review-guard/rules.md` | 你的规则文件；不存在就回退内置基线 |
| `rulesMaxChars` | `12000` | 规则文本上限，超出即截断并在 `status.json` 记 `truncated` |
| `maxLogBytes` | `2000000` | `assemblies.jsonl` 大小上限，超出轮转为 `assemblies.jsonl.1`（只保留一代） |
| `instancesTtlMs` | `604800000` | `instances/` 里旧快照的存活时间（默认 7 天） |
| `instancesMaxFiles` | `20` | `instances/` 文件数上限（当前实例永不删） |
| `recordSectionNames` | `false` | 是否把完整段名清单写进日志；默认只写数量 `sectionCount` 与哈希 `sectionNamesHash` |
| `healthCheck` | `true` | 主通道健康检查（写 `health.json`；判定失效时 `console.warn` 一次） |
| `staleGraceMs` | `120000` | 启动宽限期：这段时间内不下"失效"结论 |
| `staleLagMs` | `7200000` | 弱证据阈值：有会话活动、但心跳滞后超过它即判失效 |

## 让规则按你的需要走

内置的 7 条是**基线**。想再加自己的规则，只改一个文件 —— 两条通道会同时用新文本：

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.dsh\zh-review-guard" | Out-Null
@'
- 汇报时先给结论，再给证据。
- 动手前先说明会碰哪些文件。
'@ | Set-Content -Encoding utf8 "$env:USERPROFILE\.dsh\zh-review-guard\rules.md"
```

| `rulesMode` | 最终注入的规则 | 适合谁 |
| --- | --- | --- |
| `append`（默认） | 内置 7 条 + `## 本机追加规则` + 你的文件 | 想保留基线、只做加法 |
| `replace` | 只用你的文件内容（仍带归属标记） | 想完全自定义 |
| `off` | 只用内置 7 条（忽略文件） | 临时排除自己的规则 |

改完**不用重启**：心跳每 `syncIntervalMs`（默认 60 秒）检查一次规则文件的修改时间，有变化就重新解析 —— 计入 `status.json` 的 `rulesReloads`，通道 1 与通道 2 同时换成新文本。

## 可观测性

- `$DSH_HOME/zh-review-guard/assemblies.jsonl` — 每次装配一行：`at / instanceId / sessionId / fresh / isSubagent / action / rulesHash / sectionCount / sectionNamesHash`（`recordSectionNames: true` 时才附完整 `sectionNames` 数组）；超过 `maxLogBytes` 轮转为 `assemblies.jsonl.1`
- `$DSH_HOME/zh-review-guard/status.json` — 最后活跃实例的快照：`assemblies / sessions / appends / replaces / hookErrors / lastSectionCount / lastSectionNamesHash / logRotations / instancesPruned / agentsFile{path,owned,ownedBy,reason,userContentKept,backup,syncedAt,skippedAt,error}`、`rules{source,mode,chars,hash,truncated}`、`rulesReloads`、`contract{event,registerOk,eventKnown,error}`
- `$DSH_HOME/zh-review-guard/health.json` — **主通道心跳**：`level / stale / reasons / checkedAt / sessionsSeen`（判断"主通道是否被上游悄悄改死"就靠它）
- `$DSH_HOME/zh-review-guard/instances/<id>.json` — 每个实例各自的计数（双实例下不互相覆盖）

## 常见问题

<details>
<summary><b>会和我自己的 AGENTS.md 打架吗？</b></summary>

不会。只有文件**不存在/为空**、或文件确实是本插件管理的（`agents-state.json` 里记录的哈希对得上，或全文就是本插件的文本）才会写入；你自己手写的文件永远是安全的。确实要覆盖时先备份到 `zh-review-guard/backups/`，判定依据记录在 `status.json` 的 `agentsFile.ownedBy`。
</details>

<details>
<summary><b>为什么有时会有两个实例？</b></summary>

开发机热装配（`loader.create`）和 `cordis.patch.yml` 的 `insert` 层会各起一个实例：它们用**同名 section + 就地替换**，系统提示词里最终只有一段。`hookErrors: 0` 且 `replaces > 0` 就是这条幂等路径的证据。只用 `dsh plugin add` 安装时通常只有一个实例。
</details>

<details>
<summary><b>怎么彻底卸干净？</b></summary>

`dsh plugin --profile <p> remove dsh-zh-review-guard` 会同时清掉 profile `package.json` 里的依赖项与 `dsh.profile.bundles` 项。插件之外还剩两处，按需删：`$DSH_HOME/AGENTS.md` 里那段带标记的规则、以及 `$DSH_HOME/zh-review-guard/` 观测目录。
</details>

<details>
<summary><b>我怎么知道主通道（<code>system-prompt/assemble</code>）还活着？</b></summary>

看 `health.json`：

- `level: "ok"` —— 有新的装配记录，主通道在工作。
- `level: "idle"` —— 还没有会话活动（刚装完的机器就是这样），不下结论、不误报。
- `level: "warming"` —— 启动宽限期内（默认 2 分钟），不下结论。
- `level: "stale"` —— **疑似失效**：加载之后确实出现了新会话（`sessionsSeen.newDirsSince > 0`），却一次装配都没发生。此时 `reasons` 会写明证据，App 日志里出现一条 `主通道疑似失效` 警告。

`status.json` 的 `contract` 是另一条独立的线：`registerOk` 记录 `ctx.on('system-prompt/assemble', …)` 是否注册成功（上游改事件名时这里会变成 `false` 并带 `error`），`eventKnown` 是尽力而为的事件名探测（`true` / `null`；`null` 只表示"没探到"，不代表坏）。
</details>

<details>
<summary><b>环境要求？</b></summary>

`node >= 22`（DSH 自带的 node 就满足）、`dsh >= 0.0.1-rc`。零第三方依赖，无编译步骤，不需要网络与包源。
</details>

## 从源码开发

```bash
git clone https://github.com/ROBOHAPPYIY/dsh-zh-review-guard
node test/selftest.mjs      # 67 项断言，零依赖，不需要 DSH 运行时
```

在装有 `dsh-super-injector` 的开发机上可以免重启热装配：

```
dev_install_package  <仓库目录>      # 热装配（改代码后 dev_reload_package 重载）
dev_uninject_plugin  dsh-zh-review-guard
```

## 许可证

[MIT](./LICENSE) © 2026 ROBOHAPPYIY —— 可自由使用、修改、再分发（含商用、含二次封装），保留版权声明即可。

## 相关

- 保姆级安装教程与排障：[`INSTALL.md`](./INSTALL.md)
- 版本说明：[Releases](https://github.com/ROBOHAPPYIY/dsh-zh-review-guard/releases)
