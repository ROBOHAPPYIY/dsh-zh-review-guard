# v0.2.0 —— 让"主通道悄悄失效"看得见，让规则可以自己改

这一版回答两个真实顾虑：**上游一改事件名或瀑布契约，插件是不是就静默死掉了？** 以及 **规则能不能不写死在代码里？**

## 这一版多了什么

- **主通道健康检查**：每个心跳周期扫一次 `$DSH_HOME/sessions`。如果"加载之后出现了新会话"（世界确实在动）却"一次装配都没发生"，就判定 `stale`，写进 `$DSH_HOME/zh-review-guard/health.json`，并在 App 日志里 `console.warn` 一次。
  - `ok` 心跳新鲜 / `idle` 还没有会话活动 / `warming` 启动宽限期内 —— 后两种都不算失效，刚装完还没人用 DSH 的机器**不会误报**。
  - 弱证据：有会话活动、但心跳滞后超过 `staleLagMs`（默认 2 小时）同样判 `stale`。
- **契约自检**：`ctx.on('system-prompt/assemble', …)` 的注册被包在 try/catch 里；失败也不崩，而是把 `contract.registerOk=false` 与 `error` 写进 `status.json`。另有 best-effort 的事件名探测 `contract.eventKnown`（`true` / `null`，`null` 只表示"没探到"）。
- **规则可配置**：新增 `rulesMode`（`append` / `replace` / `off`）、`rulesFile`（默认 `$DSH_HOME/zh-review-guard/rules.md`）、`rulesMaxChars`（默认 12000）。
  - `append`（默认）= 内置 7 条 + 你的「本机追加规则」；`replace` = 只用你的文件；`off` = 只用内置。
  - 规则文件**改了不用重启**：心跳检查文件 mtime，有变化就重新解析（`status.json` 的 `rulesReloads` 计数），通道 1 与通道 2 同时换成新文本。
  - 超出 `rulesMaxChars` 会截断，并在 `status.json` 记 `rules.truncated` 与原因。
- **升级安全**：`AGENTS.md` 的归属标记改为按**前缀**认领（`<!-- managed-by: dsh-zh-review-guard`）。v0.1.x 写下的 `v0.1.1` 标记在升级后仍被认领，会就地升级为新文本；你手写的 `AGENTS.md` 依旧永远不会被覆盖。
- **自测 57 项**（v0.1.1 是 31 项）：新增规则解析 6 项、健康判定 5 项、会话扫描 4 项、契约自检 1 项、真实 tick 集成 6 项（含"改了 rules.md 真的热更新"与"零装配真的判 stale"）。

## 从 v0.1.x 升级（两步）

```powershell
dsh plugin --profile desktop add github:ROBOHAPPYIY/dsh-zh-review-guard#v0.2.0
# 然后完全退出并重启 DSH App
```

旧的 `AGENTS.md` 规则段会被就地升级（靠前缀认领），不需要手工清理。

## 资产

| 文件 | 大小 | SHA256 |
| --- | --- | --- |
| dsh-zh-review-guard-0.2.0.tgz | 28 166 字节（27.5 KB） | `9345A147858623DEAAA92FB843CAD001946909FE3E4F72EEA4E5476D673548A6` |

下载后核对：

```powershell
Invoke-WebRequest "https://github.com/ROBOHAPPYIY/dsh-zh-review-guard/releases/download/v0.2.0/dsh-zh-review-guard-0.2.0.tgz" -OutFile .\dsh-zh-review-guard-0.2.0.tgz
Get-FileHash .\dsh-zh-review-guard-0.2.0.tgz -Algorithm SHA256
```

## 许可证

[MIT](./LICENSE) © 2026 ROBOHAPPYIY
