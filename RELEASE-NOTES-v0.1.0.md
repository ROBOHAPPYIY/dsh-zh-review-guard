# v0.1.0 — 首个可分发版本

`dsh-zh-review-guard`：把「内部思考视为用户可见、需要审阅」和「面向用户的内容用简体中文」从一份可能被忘记、被覆盖的文档约定，变成 DSH 的**底层机制**——每个会话每次装配系统提示词时都会被调用，规则常驻，不受上下文压缩影响。

## 这一版包含什么

- **通道 1（主）**：`ctx.on('system-prompt/assemble', ...)` 瀑布注入常驻 section `{ name: 'zh-review-guard', order: 4, text: RULES_TEXT }`；同名段就地替换，幂等。
- **通道 2（备）**：同一份 `RULES_TEXT` 同步到 `$DSH_HOME/AGENTS.md`，由 `@deepseek-ai/dsh-agent-instructions` 在会话首个 pre-step 作为持久基线注入；**只接管文件不存在或带 `<!-- managed-by: dsh-zh-review-guard v0.1.0 -->` 标记的文件**，用户手写的 `AGENTS.md` 绝不覆盖。两条通道独立，任一条即可让规则生效（首轮被上游预设整体替换 `sections` 时靠通道 2 兜底）。
- **可观测性**：`$DSH_HOME/zh-review-guard/assemblies.jsonl`（每次装配一行：会话 id / 是否新会话 / 动作 / 段名清单 / 规则哈希）、`status.json`、`instances/<id>.json`。
- **零依赖、无编译**：只用 `node:` 内置模块，`lib/index.js` 即可运行的 ESM 源码。
- **26 项离线自测**：`node test/selftest.mjs`，不需要 DSH 运行时。

## 安装（在目标电脑上）

```powershell
dsh plugin --profile <profile> add "<path\to>\dsh-zh-review-guard-0.1.0.tgz"
```

`add` 会自动把包名写进 profile 的 `dsh.profile.bundles`（实测：`dependencies` 记 `file:...tgz`，`bundles` 从 `[]` 变 `["dsh-zh-review-guard"]`），装完**重启 App** 生效。完整步骤、验证方法与实测踩到的坑（profile `package.json` 不能带 BOM、tgz 路径不能删等）见包内 `INSTALL.md`。

## 资产

| 文件 | 大小 | SHA256 |
| --- | --- | --- |
| `dsh-zh-review-guard-0.1.0.tgz` | 11 228 B（约 11.0 kB） | `8708BD708D7364C72F1B6376301B8BD5CA4ECC0D7623563FD93A1D31A68D2B91` |

（本表由 `npm pack` 产物的实际字节数与 `Get-FileHash -Algorithm SHA256` 填入。校验方式：下载后 `Get-FileHash .\dsh-zh-review-guard-0.1.0.tgz -Algorithm SHA256`。）

## 兼容性

- `engines`：`node >= 22`、`dsh >= 0.0.1-rc`
- 实测环境：DSH 0.2.0-rc.2 / Windows / profile `desktop`
