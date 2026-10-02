# v0.2.1 —— 把"能覆盖"收窄成"只覆盖自己的"，而且动了手先备份

这一版来自一次独立审计（漏洞 / API 写入面 / token 开销三个角度）。审计结论是：运行时零网络、零子进程、零第三方依赖；真正的问题只有一个 —— **通道 2 写 `AGENTS.md` 的判据过宽**。

## 修了什么

- **接管判据收紧（中高危）**：v0.2.0 只要文件里**出现** `<!-- managed-by: dsh-zh-review-guard` 这段前缀，就被判定为"本插件所有"，随后**整份覆盖**。用户自己的 `AGENTS.md` 里若恰好有这一行（从文档里复制过规则片段、或从别的机器拷来），内容会被无声抹掉。v0.2.1 改为三种情形之一才写入：①文件不存在或只有空白；②内容与 `zh-review-guard/agents-state.json` 记录的哈希一致；③全文就是本插件的规则文本（仅 `managed-by` 里的版本号不同）。
- **覆盖前备份**：真要改写时先把原文件存到 `zh-review-guard/backups/AGENTS.md.<时间戳>.bak`，默认保留 5 份（`backupAgentsFile` / `agentsBackupKeep`）。
- **所有权证据**：新增 `zh-review-guard/agents-state.json`（记录本插件上次写入内容的哈希）。这一个文件同时解决两个问题：收紧判据后插件仍认得自己写的文件，规则改了照样能就地更新；而用户手写文件永远不会被误认为"自己的"。
- **磁盘卫生**：`assemblies.jsonl` 超过 `maxLogBytes`（默认 2 000 000 字节）轮转为 `assemblies.jsonl.1`（只留一代）；`instances/` 按 `instancesTtlMs`（默认 7 天）与 `instancesMaxFiles`（默认 20）清理，当前实例永不删。
- **降低暴露面**：装配日志默认只记 `sectionCount` 与 `sectionNamesHash`，不再把每轮的 system prompt 段名清单逐条落盘（要恢复就把 `recordSectionNames` 设为 `true`）；`status.json` 同步换成 `lastSectionCount` / `lastSectionNamesHash`。
- **自测 57 → 67 项**：新增"含标记片段的用户文件必须保留""仅版本号不同的旧文本应升级并备份""纯函数判定矩阵""日志轮转""instances 清理"等用例。

## 未改动（审计已确认，无需改）

- 运行时**不联网**、**不起子进程**、无第三方依赖（`lib/index.js` 只 import `node:fs` / `node:crypto` / `node:os` / `node:path`）。
- 注入的 token 开销：单通道约 **538 tokens/轮**；双实例双通道时同一文本被注入两遍，约 **1076 tokens/轮**。这一项**没有**在本版改动 —— 关掉通道 2 会牺牲"上游整体替换 `sections` 时的兜底"，取舍留给你。

## 资产

| 文件 | 大小 | SHA256 |
| --- | --- | --- |
| dsh-zh-review-guard-0.2.1.tgz | 35 197 字节（34.4 KB） | `A6805A63C8CA3A7216C9E1E7BE8A72DB9F9116C7E728352B8764DFEBEC7F77DB` |

文件清单与 v0.2.0 一致（7 项）：`package/{LICENSE, lib/index.js, package.json, INSTALL.md, README.md, test/selftest.mjs, cordis.patch.yml}`。
解包后 `node test/selftest.mjs` → `67/67 passed`。

**已发布**：<https://github.com/ROBOHAPPYIY/dsh-zh-review-guard/releases/tag/v0.2.1>（2026-10-02，Release 列表中标记为 Latest）。
附件 `dsh-zh-review-guard-0.2.1.tgz`（35 197 字节）从 Release 下载回来后复验 SHA256 = `A6805A63C8CA3A7216C9E1E7BE8A72DB9F9116C7E728352B8764DFEBEC7F77DB`，与本地产物**逐字节一致**。

## 从 v0.2.0 升级

```powershell
# 本地 tgz（发布前）
dsh plugin --profile desktop add "D:\AGENTCREATE\dist\dsh-zh-review-guard-0.2.1.tgz"
# 发布后：把 tag 换成新版本号
# dsh plugin --profile desktop add github:ROBOHAPPYIY/dsh-zh-review-guard#v0.2.1
# 然后完全退出并重启 DSH App
```

旧 `AGENTS.md`（带 v0.2.0 标记）会被认领并就地升级，**升级前会先备份**到 `zh-review-guard/backups/`。

## 文档同步

- `README.md`：接管规则、配置表（新增 6 个键）、观测字段、FAQ、自测项数
- `INSTALL.md`：`status.json` 示例、文件写入判据表、版本表、升级说明、v0.2.1 复检记录
- 本文件：`RELEASE-NOTES-v0.2.1.md`

## 维护者发布步骤（2026-10-02 已执行完毕）

本机 profile 里 `dsh-zh-review-guard` 是 `link:D:\AGENTCREATE\dsh-zh-review-guard`（junction），所以**本机不需要 `dsh plugin add`**：源码目录就是安装源，重启 App 即生效。

重做一次时最容易踩的三个坑（本次全部踩过）：

| 坑 | 绕法 |
| --- | --- |
| `PATH` 里的 `gh` 登录失效：`The token in keyring is invalid` | 改用 dsh 自带那份：`C:\Users\<你的用户名>\.dsh\bin\gh.exe`（同一账号、token 有效、scopes 含 `repo`） |
| git 直连 `github.com:443` 不通：`Failed to connect to github.com:443 after 21114 ms` | 加 `-c http.proxy=http://127.0.0.1:7897` 走本地代理 |
| 全局 `url.…ghfast.top….insteadOf https://github.com/` 把直连 URL 重写回镜像域名，而凭据是按 host 查找的 → 认证失败 | 让 `GIT_CONFIG_GLOBAL` 指向空配置去掉重写，再用 `-c credential.helper=` 重置 helper 链并接上 gh 的 `auth git-credential` |

若 `PATH` 里的 `gh` 已恢复登录，下面这套（走 `publish-github.ps1`）最省事：

```powershell
gh auth refresh -h github.com        # 1) 恢复登录

# 把产物放回惯例目录（沙箱内写不进 release\，你自己的终端可以）
Copy-Item D:\AGENTCREATE\dist\dsh-zh-review-guard-0.2.1.tgz D:\AGENTCREATE\release\

cd D:\AGENTCREATE\dsh-zh-review-guard
git add -A
git commit -m "release: v0.2.1 - ownership-hash claim + pre-overwrite backup; log rotation; section names hashed by default"
git tag -a v0.2.1 -m "dsh-zh-review-guard v0.2.1"

# 2) 推送 + 建 Release（-NoRewrite 避开全局 ghfast.top 重写，同时保留 gh 凭据助手）
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
& .\publish-github.ps1 -Owner ROBOHAPPYIY -Tag v0.2.1 -Notes RELEASE-NOTES-v0.2.1.md `
    -Tgz D:\AGENTCREATE\release\dsh-zh-review-guard-0.2.1.tgz -NoRewrite
```

脚本最后会把 Release 附件重新下载回来比对 SHA256，出现 `OK: release asset matches the local tgz byte for byte` 才算发布成功。

### 实际执行记录（2026-10-02）

`PATH` 里的 `gh` 登录失效，所以没有用脚本，而是按脚本的等价步骤手动执行：

```powershell
$px = 'http://127.0.0.1:7897'
$ghHelper = "credential.helper=!'C:\Users\<你的用户名>\.dsh\bin\gh.exe' auth git-credential"
$url = 'https://github.com/ROBOHAPPYIY/dsh-zh-review-guard.git'

Copy-Item D:\AGENTCREATE\dist\dsh-zh-review-guard-0.2.1.tgz D:\AGENTCREATE\release\ -Force
Set-Content -Path "$env:TEMP\git-empty.cfg" -Value '' -Encoding ASCII
$env:GIT_CONFIG_GLOBAL = "$env:TEMP\git-empty.cfg"     # 去掉 url.insteadOf 重写
$env:GIT_TERMINAL_PROMPT = '0'

# 提交与标签（本地）
git add -A
git commit -m "release: v0.2.1 - ownership-hash claim + pre-overwrite backup for AGENTS.md; log rotation and instances pruning; section names hashed by default"
git tag -a v0.2.1 -m "dsh-zh-review-guard v0.2.1"

# 推送（直连 github.com + 本地代理 + dsh 自带的 gh 凭据助手）
git -c http.proxy=$px -c credential.helper= -c $ghHelper push $url main
git -c http.proxy=$px -c credential.helper= -c $ghHelper push $url refs/tags/v0.2.1

# 建 Release（用 dsh 自带那份 gh）
$env:HTTPS_PROXY = $px
& 'C:\Users\<你的用户名>\.dsh\bin\gh.exe' release create v0.2.1 D:\AGENTCREATE\release\dsh-zh-review-guard-0.2.1.tgz `
    --repo ROBOHAPPYIY/dsh-zh-review-guard --title 'v0.2.1 - dsh-zh-review-guard' `
    --notes-file D:\AGENTCREATE\dsh-zh-review-guard\RELEASE-NOTES-v0.2.1.md
```

结果：提交 `5879249` → `main`；标签 `v0.2.1` → `dba8c47`；Release 创建成功并标记为 **Latest**，附件 35 197 B，下载回来 SHA256 与本地产物一致。

发布后收尾（2026-10-02 已完成）：

1. ✅ `README.md`（第 58/61/70 行）与 `INSTALL.md`（第 78/81/89/98/111/122/130/133/317/360/527/528/529 行）里的一键安装与下载引用已切到 `#v0.2.1`；历史复检记录里的 `v0.2.0` 原样保留
2. ✅ 附件与本地 tgz 逐字节一致，SHA256 无需回填
3. ✅ 本节与资产节「尚未发布」的说明已改为 Release 直链

## 许可证

[MIT](./LICENSE) © 2026 ROBOHAPPYIY
