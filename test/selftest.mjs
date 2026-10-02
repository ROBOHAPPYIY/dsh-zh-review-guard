/**
 * 自测：用假 ctx / 假 assembly 验证护栏插件的核心契约。
 * 运行：node test/selftest.mjs   （不需要 DSH 运行时，零依赖）
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, MARKER, MARKER_PREFIX, RULES_TEXT, VERSION, name } from '../lib/index.js'

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

for (const [s, label, extra] of rows) console.log(`${s}  ${label}${extra ? '  (' + extra + ')' : ''}`)
const failed = rows.filter((r) => r[0] === 'FAIL').length
console.log(`\n${rows.length - failed}/${rows.length} passed`)
