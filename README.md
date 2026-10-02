# dsh-zh-review-guard

把「用户需求」从一份可能被忘记、被覆盖的文档约定，变成 DSH 的底层机制：**每个会话装配系统提示词时都会被调用**，规则常驻在系统提示词里。

## 用户需求（本插件要保证生效的内容）

- 内部思考（reasoning）视为用户可见且需要审阅的内容。
- 在进行思考和申请系统级权限的说明描述，等需要用户审阅的地方尽量使用简体中文。

插件把这两条原文（含执行口径共 7 条，见 `lib/index.js` 的 `RULES_TEXT`）作为**单一事实来源**。

## 两条互相独立的生效通道

| 通道 | 机制 | 覆盖范围 | 抗压缩 |
| --- | --- | --- | --- |
| 1（主） | `ctx.on('system-prompt/assemble', ...)` 瀑布，按 `sectionName` 注入常驻 section `{ name, order: 4, text: RULES_TEXT }` | 每个会话**每次**装配系统提示词 | 是（官方注入点，不走 transcript） |
| 2（备） | 把同一份 `RULES_TEXT` 同步到 `$DSH_HOME/AGENTS.md`，由 `@deepseek-ai/dsh-agent-instructions` 在会话**首个 pre-step** 作为持久基线注入 | 会话首轮（含通道 1 被上游整体替换的极端情形） | 是（基线逐轮对账） |

> 为什么需要两条：本机 `router-standard` 预设的 `router-bootstrap-v34.mjs:648-651` 在「首轮（还没有任何 tool/call）」会**整体替换** `sections` 为 `baseSections`（只保留 `/plan/i` 段 + `router-persona`）。通道 1 与该预设的层叠顺序决定首轮是否被丢弃；通道 2 不受该替换影响，因此首轮也一定有规则。装配日志里的 `sectionNames` 字段可用于核对每次装配后的段清单。

## 配置（`cordis.patch.yml` 的 `config`，全部可选）

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 关掉整个插件 |
| `sectionName` | `zh-review-guard` | 注入的 section 名；同名段会被就地替换（幂等，不会重复追加） |
| `order` | `4` | 段排序（router 用 0-3） |
| `logDir` | `$DSH_HOME/zh-review-guard` | 观测日志目录 |
| `syncAgentsFile` | `true` | 是否同步 `$DSH_HOME/AGENTS.md` |
| `includeSubagents` | `true` | 子会话是否也注入 |
| `syncIntervalMs` | `60000` | 周期兜底同步间隔 |

`AGENTS.md` 的接管规则：**只有文件不存在、或文件里带有 `<!-- managed-by: dsh-zh-review-guard v0.1.0 -->` 标记时才写入**；用户手写的、没有标记的 `AGENTS.md` 绝不会被覆盖（`status.json` 的 `agentsFile.owned` 会记录判定结果）。

## 可观测性（用于自证「每个会话都调用了」）

- `$DSH_HOME/zh-review-guard/assemblies.jsonl` — 每次装配一行：`at / instanceId / sessionId / fresh（是否该实例第一次见到该会话）/ isSubagent / action（append|replace）/ rulesHash / sectionNames`
- `$DSH_HOME/zh-review-guard/status.json` — **最后活跃实例**的快照（`instanceId / pid / assemblies / sessions / appends / replaces / hookErrors / lastSectionNames / agentsFile`）
- `$DSH_HOME/zh-review-guard/instances/<instanceId>.json` — 每个实例各自的计数。装配是「双路径」（`loader.create` 热装配 + `cordis.patch.yml` 的 `insert` 层），可能同时存在两个实例，因此累计计数要看 `instances/`，而 `assemblies.jsonl` 是合并时间线（同一 `name` 的段按名字幂等，不会重复注入）

## 自测与使用

```bash
node test/selftest.mjs      # 26 项断言，零依赖，不需要 DSH 运行时
```

安装：

- **本机（开发机，免重启热装配）**：
  ```
  dev_install_package  D:\AGENTCREATE\dsh-zh-review-guard
  ```
- **别的电脑（标准 CLI，只需 tgz、无需源码/联网）**：
  ```
  dsh plugin --profile <profile> add <path\to>\dsh-zh-review-guard-0.1.0.tgz
  ```
  这一步会自动把包名写进 profile 的 `dsh.profile.bundles`，装完重启 App 生效。完整步骤、验证方法与本机实测踩到的坑见 [`INSTALL.md`](./INSTALL.md)。
- **从 GitHub Releases 拿包（v0.1.0 已发布）**：

  | 项 | 值 |
  | --- | --- |
  | 仓库 | https://github.com/ROBOHAPPYIY/dsh-zh-review-guard |
  | Release | https://github.com/ROBOHAPPYIY/dsh-zh-review-guard/releases/tag/v0.1.0 |
  | 附件直链 | https://github.com/ROBOHAPPYIY/dsh-zh-review-guard/releases/download/v0.1.0/dsh-zh-review-guard-0.1.0.tgz |
  | 大小 / SHA256 | 11 228 B / `8708BD708D7364C72F1B6376301B8BD5CA4ECC0D7623563FD93A1D31A68D2B91` |

  ```powershell
  Invoke-WebRequest -Uri "https://github.com/ROBOHAPPYIY/dsh-zh-review-guard/releases/download/v0.1.0/dsh-zh-review-guard-0.1.0.tgz" -OutFile .\dsh-zh-review-guard-0.1.0.tgz
  (Get-FileHash .\dsh-zh-review-guard-0.1.0.tgz -Algorithm SHA256).Hash   # 应等于 8708BD70...
  ```

  tgz 内已自带 `README.md` 与 `INSTALL.md`，不需要另拷源码。已用该 Release 附件在空白 profile 上复验：解包自测 `26/26 passed`、`dsh plugin add` `exit=0`、`--dump-config` 里出现 `# == dsh-zh-review-guard` 层。

卸载 / 排查：

```
dev_uninject_plugin  dsh-zh-review-guard     # 卸载注入
dev_reload_package   dsh-zh-review-guard     # 改代码后确定性热重载
```

## 已知行为（实测）

- **双实例**：`dev_install_package` 同时留下 loader.create 的运行时条目与 patch 插入项，于是会出现两个实例（各写各的 `instances/<id>.json`；`status.json` 是最后活跃实例的快照）。两者用**同名 section + 就地替换**，最终系统提示词里只有一段——`hookErrors=0` 且 `replaces>0` 就是这条幂等路径的证据。
- **首轮兜底**：首轮（还没有 tool/call）若上游预设整体替换 `sections`，通道 1 的段会被丢掉，此时规则由通道 2（`AGENTS.md` 基线）保证仍然生效。
- **文件尾部**：`AGENTS.md` 内容 = `RULES_TEXT` + 一个结尾换行（618 字符 / 1562 字节）。
- 不想要「同步 AGENTS.md」这条通道，把 `config.syncAgentsFile` 设为 `false` 即可。

## 包形态

零第三方依赖（只用 `node:` 内置模块），**没有编译步骤**：`lib/index.js` 即可运行的 ESM 源码；`cordis.patch.yml` 声明 bundle 层插入项（`{ id, name }`）。
