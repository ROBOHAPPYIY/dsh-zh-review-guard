# v0.1.1 — 文档与许可证发版

这是一个**只动文档与元数据**的补丁版本（`lib/index.js` 除了版本号常量与归属标记的前缀判定外没有行为变化），把 v0.1.0 之后在仓库里补齐的东西正式打进可分发的 tgz。

## 这一版比 v0.1.0 多了什么

- **`LICENSE`（MIT）**：正式授权 —— 可自由使用、修改、再分发（含商用、含二次封装），保留版权声明即可。
- **`INSTALL.md` 重写为保姆级分步教程**：从「`Win + X` 打开 PowerShell」开始，到下载（含网络不通时的三条替代路）、核对 SHA256、选 profile、安装、重启、逐项验证、卸载，外加**故障排查 A–G** —— `dsh` 命令找不到及绝对路径兜底、profile `package.json` 带 BOM 导致 `SyntaxError: ... is not valid JSON` 的成因与修法、装完没生效的五步排查、tgz 路径失效、下载失败、双实例属正常、如何用 `assemblies.jsonl` 证明真的注入 —— 以及手动安装方案。**这份教程在 tgz 包内自带**，离线也能照做。
- **README 面向外部访客重写**：徽章、痛点→后果对照、装上之后的变化、规则原文、三步安装、两条通道原理、配置与可观测性、折叠 FAQ。
- **自测从 26 项扩到 31 项**：新增覆盖「通道 2」的 AGENTS.md 同步契约 —— 老版本（v0.1.0）写下的标记在升级后仍被认领并就地升级、用户手写的 `AGENTS.md` 绝不被覆盖、文件不存在时创建。运行 `node test/selftest.mjs` → `31/31 passed`。
- **归属标记前缀跨版本稳定**：认领判定改为匹配 `<!-- managed-by: dsh-zh-review-guard` 这个前缀，因此从 v0.1.0 升级上来的用户，其已有的 `AGENTS.md` 会继续被接管（不会因为版本号变化而"掉线"，也不会重复追加一份规则）。

## 安装

和 v0.1.0 一样（完整步骤见包内 `INSTALL.md`，在线版 https://github.com/ROBOHAPPYIY/dsh-zh-review-guard/blob/main/INSTALL.md ）：

```powershell
# 1. 下载附件
Invoke-WebRequest "https://github.com/ROBOHAPPYIY/dsh-zh-review-guard/releases/download/v0.1.1/dsh-zh-review-guard-0.1.1.tgz" -OutFile .\dsh-zh-review-guard-0.1.1.tgz
Get-FileHash .\dsh-zh-review-guard-0.1.1.tgz -Algorithm SHA256   # 对照下面「资产」表里的值

# 2. 装进你的 profile（Web GUI 用 web，桌面端用 desktop），装完重启 App
dsh plugin --profile desktop add .\dsh-zh-review-guard-0.1.1.tgz
```

**从 v0.1.0 升级**：先移除旧版，再装新包即可（`remove` 会同时清掉 profile `package.json` 里的 `dependencies` 与 `dsh.profile.bundles` 两项）：

```powershell
dsh plugin --profile desktop remove dsh-zh-review-guard
dsh plugin --profile desktop add .\dsh-zh-review-guard-0.1.1.tgz
```

## 资产

| 文件 | 大小 | SHA256 |
| --- | --- | --- |
| `dsh-zh-review-guard-0.1.1.tgz` | 18 272 B（约 17.9 kB） | `A688F80945295B8D803C9FE1211D301D844770691EFE02215CBF0CE0D2E0E453` |

（本表由 `npm pack` 产物的实际字节数与 `Get-FileHash -Algorithm SHA256` 填入。校验方式：下载后 `Get-FileHash .\dsh-zh-review-guard-0.1.1.tgz -Algorithm SHA256`。）

## 兼容性

- `engines`：`node >= 22`、`dsh >= 0.0.1-rc`
- 实测环境：DSH 0.2.0-rc.2 / Windows / profile `desktop`

## 许可证

[MIT](./LICENSE) © 2026 ROBOHAPPYIY —— 可自由使用、修改、再分发（含商用、含二次封装），保留版权声明即可。
