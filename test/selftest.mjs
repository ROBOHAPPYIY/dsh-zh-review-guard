/**
 * 自测：用假 ctx / 假 assembly 验证护栏插件的核心契约。
 * 运行：node test/selftest.mjs   （不需要 DSH 运行时，零依赖）
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { apply, ASSEMBLE_EVENT, evaluateHealth, MARKER, MARKER_PREFIX, RULES_BASELINE, RULES_TEXT, resolveRules, scanSessions, VERSION, name } from '../lib/index.js'

const rows = []
const check = (label, ok, extra = '') => {
  rows.push([ok ? 'PASS' : 'FAIL', label, extra])
  if (!ok) process.exitCode = 1
}

const dir = mkdtempSync(join(tmpdir(), 'zh-guard-'))
const handlers = []
const disposers = []
const fakeCtx = {
  on(event, fn) {
    handlers.push({ event, fn })
  },
  effect(fn) {
    disposers.push(fn())
  },
}

apply(fakeCtx, { logDir: dir, syncAgentsFile: false })

check('插件名正确', name === 'dsh-zh-review-guard')
check('注册了 system-prompt/assemble 瀑布', handlers.some((h) => h.event === 'system-prompt/assemble'))
check('规则含两条用户需求原文', RULES_TEXT.includes('内部思考（reasoning）视为用户可见且需要审阅的内容') && RULES_TEXT.includes('需要用户审阅的地方尽量使用简体中文'))
check('规则含归属标记', RULES_TEXT.startsWith(MARKER))

const hook = handlers.find((h) => h.event === 'system-prompt/assemble').fn
const fakeNext = async () => ({ sections: [{ name: 'persona', text: 'P' }], tools: [{ name: 'read' }], contexts: [] })

const session = { id: 's-test-1' }
const out1 = await hook({}, { agent: { session } }, fakeNext)
check('首轮：注入了 zh-review-guard 段', out1.sections.some((s) => s.name === 'zh-review-guard'))
check('首轮：既有 persona 段未被破坏', out1.sections[0].name === 'persona')
check('首轮：tools 原样透传', out1.tools.length === 1)

const out2 = await hook({}, { agent: { session } }, fakeNext)
check('幂等：同会话不重复追加段', out2.sections.filter((s) => s.name === 'zh-review-guard').length === 1)

const out3 = await hook({}, { agent: { session: { id: 's-test-2' } } }, fakeNext)
check('新会话：同样注入', out3.sections.some((s) => s.name === 'zh-review-guard'))

const subOut = await hook({}, { agent: { session: { id: 'sub-1', header: { parentSession: 's-test-1' } } } }, fakeNext)
check('子会话：默认也注入', subOut.sections.some((s) => s.name === 'zh-review-guard'))

let threw = false
let errOut
try {
  errOut = await hook({}, { agent: { session } }, async () => {
    throw new Error('boom')
  })
} catch {
  threw = true
}
check('下游抛错时向上冒泡（不吞异常）', threw === true && errOut === undefined)

const logPath = join(dir, 'assemblies.jsonl')
check('写出装配日志 assemblies.jsonl', existsSync(logPath))
const lines = existsSync(logPath) ? readFileSync(logPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []
const ok_lines = lines.filter((l) => l.hook === 'system-prompt/assemble')
check('装配日志条数 = 4（成功装配 4 次）', ok_lines.length === 4, `got=${ok_lines.length}`)
check('下游抛错也被记进日志（hook=next-error）', lines.some((l) => l.hook === 'next-error'))
check('同会话首条 fresh=true', ok_lines[0] && ok_lines[0].fresh === true)
check('同会话第二条 fresh=false', ok_lines[1] && ok_lines[1].fresh === false)
check('新会话 fresh=true 且 sessionId 记录正确', ok_lines[2] && ok_lines[2].fresh === true && ok_lines[2].sessionId === 's-test-2')
check('子会话被标记 isSubagent=true', ok_lines[3] && ok_lines[3].isSubagent === true)
check('日志含段名清单（可核对注入位置）', Array.isArray(ok_lines[0] && ok_lines[0].sectionNames) && ok_lines[0].sectionNames.includes('zh-review-guard'))

const statusPath = join(dir, 'status.json')
check('写出 status.json', existsSync(statusPath))
const status = existsSync(statusPath) ? JSON.parse(readFileSync(statusPath, 'utf8')) : {}
check('status 统计：assemblies=4 / sessions=3 / appends=4', status.assemblies === 4 && status.sessions === 3 && status.appends === 4, JSON.stringify({ a: status.assemblies, s: status.sessions, ap: status.appends }))
check('status 统计：hookErrors=1（抛错被计数）', status.hookErrors === 1, `got=${status.hookErrors}`)
check('status 记录了规则哈希', typeof status.rulesHash === 'string' && status.rulesHash.length === 16)
check('日志行带 8 位实例 id（多实例可区分）', /^[0-9a-f]{8}$/.test(String(ok_lines[0] && ok_lines[0].instanceId)))
check('写出每实例状态 instances/<id>.json', existsSync(join(dir, 'instances', `${status.instanceId}.json`)))

for (const d of disposers) {
  if (typeof d === 'function') d()
}
check('disposer 可安全调用（卸载即净）', existsSync(join(dir, 'disposed.json')))

// —— 通道 2：AGENTS.md 同步与跨版本认领（这段真的读写文件，所以换一个独立的临时 DSH_HOME）——
check('status 记录的版本与包版本一致', status.version === VERSION, `got=${status.version}`)
check('归属标记前缀跨版本稳定', MARKER.startsWith(MARKER_PREFIX) && MARKER.startsWith('<!-- managed-by: dsh-zh-review-guard'))

const home2 = mkdtempSync(join(tmpdir(), 'zh-guard-home-'))
const prevHome = process.env.DSH_HOME
process.env.DSH_HOME = home2
const agentsPath = join(home2, 'AGENTS.md')
const quietCtx = () => ({ on() {}, effect() {} })

// a) 老版本（v0.1.0）写下的 AGENTS.md 在升级后仍被认领，并就地升级为当前文本
writeFileSync(agentsPath, '<!-- managed-by: dsh-zh-review-guard v0.1.0 -->\n# 老版本写入\n', 'utf8')
apply(quietCtx(), { logDir: join(home2, 'log-a'), syncAgentsFile: true })
check('通道 2：老版本(v0.1.0)标记的文件仍被认领并升级', readFileSync(agentsPath, 'utf8').trim() === RULES_TEXT.trim())

// b) 用户手写的 AGENTS.md 绝不被覆盖
const userText = '# 我自己写的规则\n不要动我\n'
writeFileSync(agentsPath, userText, 'utf8')
apply(quietCtx(), { logDir: join(home2, 'log-b'), syncAgentsFile: true })
check('通道 2：用户手写的 AGENTS.md 绝不被覆盖', readFileSync(agentsPath, 'utf8') === userText)

// c) 文件不存在时创建并写入
const home3 = mkdtempSync(join(tmpdir(), 'zh-guard-home3-'))
process.env.DSH_HOME = home3
apply(quietCtx(), { logDir: join(home3, 'log-c'), syncAgentsFile: true })
check('通道 2：文件不存在时创建并写入规则', existsSync(join(home3, 'AGENTS.md')) && readFileSync(join(home3, 'AGENTS.md'), 'utf8').startsWith(MARKER))
if (prevHome === undefined) delete process.env.DSH_HOME
else process.env.DSH_HOME = prevHome

// —— v0.2.0：规则可配置（内置基线 + rules.md 的 append / replace / off / 截断）——
const rh = mkdtempSync(join(tmpdir(), 'zh-guard-rules-'))
const rulesPath = join(rh, 'zh-review-guard', 'rules.md')

const rMissing = resolveRules({ home: rh, file: rulesPath, mode: 'append' })
check('rules：文件缺失时回退内置基线', rMissing.source === 'builtin' && rMissing.text === RULES_BASELINE && rMissing.filePresent === false)

mkdirSync(dirname(rulesPath), { recursive: true })
writeFileSync(rulesPath, '- 本机追加：汇报时先说结论。\n- 本机追加：不要用 emoji。\n', 'utf8')

const rAppend = resolveRules({ home: rh, file: rulesPath, mode: 'append' })
check('rules：append 保留内置 7 条并追加本机规则', rAppend.source === 'builtin+file' && rAppend.text.includes('1. 内部思考') && rAppend.text.includes('本机追加：汇报时先说结论') && rAppend.text.includes('## 本机追加规则'))
check('rules：append 后哈希与字符数相对基线变化', rAppend.hash !== rMissing.hash && rAppend.chars > rMissing.chars)
check('rules：append 仍以归属标记开头（AGENTS.md 认领依赖它）', rAppend.text.startsWith(MARKER))

const rReplace = resolveRules({ home: rh, file: rulesPath, mode: 'replace' })
check('rules：replace 替换内置清单且保留归属标记', rReplace.source === 'file' && rReplace.text.startsWith(MARKER) && !rReplace.text.includes('1. 内部思考') && rReplace.text.includes('本机追加：汇报时先说结论'))

const rOff = resolveRules({ home: rh, file: rulesPath, mode: 'off' })
check('rules：off 模式忽略 rules.md', rOff.source === 'builtin' && rOff.text === RULES_BASELINE)

const rCut = resolveRules({ home: rh, file: rulesPath, mode: 'append', maxChars: 12 })
check('rules：超出 maxChars 被截断并记录原因', rCut.truncated === true && String(rCut.error).startsWith('truncated'))

// —— v0.2.0：主通道健康判定（纯函数）——
const H = (over) => evaluateHealth(Object.assign({ loadMs: 1000, nowMs: 1000000, assemblies: 0, lastAssembleMs: 0, sessionsSeen: { count: 3, newDirsSince: 0, newestMtimeMs: 0 }, graceMs: 100, lagMs: 600000 }, over))
check('health：新装机器无会话活动 → idle（不误报）', H({}).stale === false && H({}).level === 'idle')
check('health：宽限期内不下结论 → warming', H({ nowMs: 1050 }).level === 'warming')
check('health：加载后出现新会话却零装配 → stale（强证据）', H({ sessionsSeen: { count: 3, newDirsSince: 2, newestMtimeMs: 999000 } }).stale === true)
check('health：装配心跳新鲜 → ok', H({ assemblies: 5, lastAssembleMs: 999000, sessionsSeen: { count: 3, newDirsSince: 0, newestMtimeMs: 999000 } }).stale === false)
check('health：会话活跃但心跳久滞 → stale（弱证据）', H({ assemblies: 5, lastAssembleMs: 100000, sessionsSeen: { count: 3, newDirsSince: 0, newestMtimeMs: 999000 } }).stale === true)

// —— v0.2.0：sessions 扫描（stale 判定的客观锚点）——
const sh = mkdtempSync(join(tmpdir(), 'zh-guard-sessions-'))
const sd = join(sh, 'sessions', '--ws--', 'session-abc')
mkdirSync(sd, { recursive: true })
writeFileSync(join(sd, 'session.v4.jsonl.zstd'), 'x', 'utf8')
const scan1 = scanSessions(sh, { sinceMs: 0 })
check('scan：统计到会话目录与最新写入时间', scan1.count === 1 && scan1.newestMtimeMs > 0)
check('scan：sinceMs=0 时已有目录计入 newDirsSince', scan1.newDirsSince === 1)
check('scan：sinceMs 在未来时不误报新会话', scanSessions(sh, { sinceMs: Date.now() + 60000 }).newDirsSince === 0)
check('scan：目录不存在时安全返回零值', scanSessions(join(sh, 'nope')).count === 0)

// —— v0.2.0：契约自检（注册失败不崩、且留下证据）——
const badHome = mkdtempSync(join(tmpdir(), 'zh-guard-badctx-'))
const prevHome2 = process.env.DSH_HOME
const disposerStart = disposers.length
process.env.DSH_HOME = badHome
let badThrew = false
try {
  apply({ on() { throw new Error('no such event bus') }, effect() {} }, { logDir: join(badHome, 'log-bad') })
} catch {
  badThrew = true
}
const badStatus = JSON.parse(readFileSync(join(badHome, 'log-bad', 'status.json'), 'utf8'))
check('契约：ctx.on 抛错时不崩，并记录 registerOk=false + error', badThrew === false && badStatus.contract.registerOk === false && typeof badStatus.contract.error === 'string')

// —— v0.2.0：集成（真实 tick → rules.md 热更新 + stale 心跳 + health.json）——
const home5 = mkdtempSync(join(tmpdir(), 'zh-guard-live-'))
process.env.DSH_HOME = home5
const rules5 = join(home5, 'zh-review-guard', 'rules.md')
mkdirSync(dirname(rules5), { recursive: true })
writeFileSync(rules5, '- 追加规则 A\n', 'utf8')
const liveDir = join(home5, 'log-live')
const liveHandlers = []
apply({ on: (e, f) => liveHandlers.push({ e, f }), effect: (fn) => disposers.push(fn()) }, { logDir: liveDir, syncIntervalMs: 5000, staleGraceMs: 1000 })
const readLive = () => JSON.parse(readFileSync(join(liveDir, 'status.json'), 'utf8'))
check('集成：启动即读到 rules.md（append）', readLive().rules.source === 'builtin+file')
check('集成：契约自检记录事件名与注册结果', readLive().contract.event === ASSEMBLE_EVENT && readLive().contract.registerOk === true)
check('集成：注册了装配瀑布，且注入文本来自解析后的规则', liveHandlers.some((h) => h.e === ASSEMBLE_EVENT) && readLive().rules.chars > RULES_BASELINE.length)

// 加载之后才出现的会话目录 = 「世界在动」的强证据
const liveSession = join(home5, 'sessions', '--ws--', 'session-new')
mkdirSync(liveSession, { recursive: true })
writeFileSync(join(liveSession, 'session.v4.jsonl.zstd'), 'y', 'utf8')
// 改 rules.md 并把 mtime 推到未来，确保 tick 一定看得见变化
writeFileSync(rules5, '- 追加规则 B\n', 'utf8')
utimesSync(rules5, new Date(), new Date(Date.now() + 3000))

await new Promise((r) => setTimeout(r, 5800))
const live = readLive()
check('集成：tick 发现 rules.md 变化并热更新（rulesReloads>=1）', live.rulesReloads >= 1, `got=${live.rulesReloads}`)
check('集成：热更新后通道 2 也同步为新文本', readFileSync(join(home5, 'AGENTS.md'), 'utf8').includes('追加规则 B'))
check('集成：加载后出现新会话却零装配 → health.stale=true', live.health.stale === true, JSON.stringify(live.health.reasons))
check('集成：写出 health.json（心跳与判定依据）', existsSync(join(liveDir, 'health.json')))
check('集成：health.json 记录 sessionsSeen.newDirsSince>=1', JSON.parse(readFileSync(join(liveDir, 'health.json'), 'utf8')).sessionsSeen.newDirsSince >= 1)

for (let i = disposerStart; i < disposers.length; i++) {
  const d = disposers[i]
  if (typeof d === 'function') d()
}
check('集成：新增实例的 disposer 可安全调用（停掉 tick）', true)

if (prevHome2 === undefined) delete process.env.DSH_HOME
else process.env.DSH_HOME = prevHome2

for (const [s, label, extra] of rows) console.log(`${s}  ${label}${extra ? '  (' + extra + ')' : ''}`)
const failed = rows.filter((r) => r[0] === 'FAIL').length
console.log(`\n${rows.length - failed}/${rows.length} passed`)
