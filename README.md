# dsh-zh-review-guard

**让 DSH 的内部思考变成你能看见、能审阅的内容；让面向你的说明始终是简体中文。**

它不是一个"记得写进 `AGENTS.md` 就好"的约定，而是 DeepSeek Harness 的 **bundle 插件**：每个会话装配系统提示词时都会被调用一次，规则以常驻 section 的形式注入，**不受上下文压缩影响**。

[![Release](https://img.shields.io/github/v/release/ROBOHAPPYIY/dsh-zh-review-guard?color=blue&label=release)](https://github.com/ROBOHAPPYIY/dsh-zh-review-guard/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/ROBOHAPPYIY/dsh-zh-review-guard/total?color=brightgreen)](https://github.com/ROBOHAPPYIY/dsh-zh-review-guard/releases)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](./package.json)
[![Self test](https://img.shields.io/badge/self%20test-26%2F26-brightgreen)](./test/selftest.mjs)
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

```powershell
# 1. 下载（也可在浏览器里点 Release 页的附件）
Invoke-WebRequest "https://github.com/ROBOHAPPYIY/dsh-zh-review-guard/releases/download/v0.1.0/dsh-zh-review-guard-0.1.0.tgz" -OutFile .\dsh-zh-review-guard-0.1.0.tgz

# 2. 核对（可选但推荐）：11228 B / 8708BD708D7364C72F1B6376301B8BD5CA4ECC0D7623563FD93A1D31A68D2B91
Get-FileHash .\dsh-zh-review-guard-0.1.0.tgz -Algorithm SHA256

# 3. 装进你的 profile（Web GUI 用 web，桌面端用 desktop）
dsh plugin --profile desktop add .\dsh-zh-review-guard-0.1.0.tgz
```

**然后重启 DSH App** —— profile 的 bundle 层栈在启动时装配，装完必须重启才生效。

卸载：

```powershell
dsh plugin --profile desktop remove dsh-zh-review-guard
```

完整的下载/手工安装/验证/卸载步骤与踩坑记录见 **[INSTALL.md](./INSTALL.md)**。

> 零第三方依赖（只用 `node:` 内置模块）、**没有编译步骤**、不联网、不写配置文件之外的位置：tgz 拷过去就能装。仓库里的 tgz 是 `npm pack` 产物，Release 附件与它逐字节一致。

## 工作原理

两条**互相独立**的通道，任一通道生效即可保证规则常驻：

| 通道 | 机制 | 覆盖范围 | 抗压缩 |
| --- | --- | --- | --- |
| 1（主） | `ctx.on('system-prompt/assemble', …)` 瀑布，按 `sectionName` 注入常驻 section `{ name: 'zh-review-guard', order: 4, text: RULES_TEXT }` | 每个会话**每次**装配系统提示词 | 是（官方注入点，不走 transcript） |
| 2（备） | 把同一份 `RULES_TEXT` 同步到 `$DSH_HOME/AGENTS.md`，由 `@deepseek-ai/dsh-agent-instructions` 在会话**首个 pre-step** 作为持久基线注入 | 会话首轮（含通道 1 被上游整体替换的极端情形） | 是（基线逐轮对账） |

<details>
<summary>为什么必须准备第二条通道？</summary>

某些会话预设（例如本机的 `router-standard`）在「首轮，还没有任何 tool/call」时会**整体替换** `sections`，只保留自己的段。此时通道 1 注入的段会被丢掉 —— 而通道 2 走的是 `AGENTS.md` 基线，不经过那个替换点，因此首轮也一定有规则。

`AGENTS.md` 的接管规则：**只在文件不存在、或文件里带有 `<!-- managed-by: dsh-zh-review-guard v0.1.0 -->` 标记时写入**。你自己手写的 `AGENTS.md` 绝不会被覆盖（判定结果记录在 `status.json` 的 `agentsFile.owned`）。
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
| `includeSubagents` | `true` | 子会话是否也注入 |
| `syncIntervalMs` | `60000` | 周期兜底同步间隔 |

## 可观测性

- `$DSH_HOME/zh-review-guard/assemblies.jsonl` — 每次装配一行：`at / instanceId / sessionId / fresh / isSubagent / action / rulesHash / sectionNames`
- `$DSH_HOME/zh-review-guard/status.json` — 最后活跃实例的快照：`assemblies / sessions / appends / replaces / hookErrors / lastSectionNames / agentsFile`
- `$DSH_HOME/zh-review-guard/instances/<id>.json` — 每个实例各自的计数（双实例下不互相覆盖）

## 常见问题

<details>
<summary><b>会和我自己的 AGENTS.md 打架吗？</b></summary>

不会。只有文件**不存在**或带本插件的归属标记时才会写入；你的手写文件永远是安全的。
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
<summary><b>环境要求？</b></summary>

`node >= 22`（DSH 自带的 node 就满足）、`dsh >= 0.0.1-rc`。零第三方依赖，无编译步骤，不需要网络与包源。
</details>

## 从源码开发

```bash
git clone https://github.com/ROBOHAPPYIY/dsh-zh-review-guard
node test/selftest.mjs      # 26 项断言，零依赖，不需要 DSH 运行时
```

在装有 `dsh-super-injector` 的开发机上可以免重启热装配：

```
dev_install_package  <仓库目录>      # 热装配（改代码后 dev_reload_package 重载）
dev_uninject_plugin  dsh-zh-review-guard
```

## 许可证

本仓库目前**未附带开源许可证文件**（按默认规则保留所有权利）。如果要在团队内分发、二次改造，或需要 MIT / Apache-2.0 之类的正式授权，开个 issue 说明用途即可，我会按需补上 `LICENSE`。

## 相关

- 安装与排障：[`INSTALL.md`](./INSTALL.md)
- 版本说明：[Releases](https://github.com/ROBOHAPPYIY/dsh-zh-review-guard/releases)
