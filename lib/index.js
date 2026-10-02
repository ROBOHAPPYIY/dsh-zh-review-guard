/**
 * dsh-zh-review-guard —— 用户级「内部思考可见 + 简体中文」护栏（DSH bundle 插件）。
 *
 * 设计目标：把「用户需求」变成底层机制，而不是一个可能被忘记/覆盖的文档约定 ——
 * 所有新会话在装配系统提示词时都会被调用，规则常驻。
 *
 * 两条互相独立的通道，任一通道即可让规则在每个会话生效：
 *   通道 1（主）：'system-prompt/assemble' waterfall（官方注入点，Waterfall 必须
 *     await next() 后再改）。把用户需求段作为常驻 section 注入；不受上下文压缩影响。
 *   通道 2（备）：把同一份文本同步到 $DSH_HOME/AGENTS.md —— 由
 *     @deepseek-ai/dsh-agent-instructions 在会话首个合格 pre-step 作为持久基线注入。
 *     仅接管带 MARKER 的文件；用户自己写的、没有 MARKER 的 AGENTS.md 绝不覆盖。
 *
 * 可观测性（用于自证「每个会话都调用了」）：
 *   $DSH_HOME/zh-review-guard/assemblies.jsonl  每次装配一行（会话 id / 是否新会话 / 动作 / 段名清单）
 *   $DSH_HOME/zh-review-guard/status.json       累计计数与最近一次装配摘要
 *
 * 无第三方依赖（仅 node: 内置模块），因此没有编译步骤。
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'

export const name = 'dsh-zh-review-guard'

/** 归属标记：只有含该标记的 AGENTS.md 才由本插件接管（避免覆盖用户手写内容）。 */
export const MARKER = '<!-- managed-by: dsh-zh-review-guard v0.1.0 -->'

/** 执行口径（单一事实来源：系统提示词 section 与 AGENTS.md 都由它生成）。 */
export const RULES_LINES = [
  '内部思考（reasoning / thinking）一律使用简体中文。',
  '内部思考视为用户可见、需要审阅的内容：给出结论之前，写清目标理解、方案取舍、为什么选 A 而不选 B、风险与不确定之处、尚未解决的问题，而不是只给结论。',
  '需要用户拍板或复核的地方（方案选择、不可逆操作、外部审批），明确写出「这是需要你确认的点」。',
  '面向用户的说明、汇报、提问、交付说明一律使用简体中文；代码、命令、路径、专有名词保留原文。',
  '申请系统级权限（沙箱升级、网络/文件系统访问、安装依赖、审批弹窗）或执行不可逆操作前，先用简体中文说明：要做什么、为什么需要、影响范围、是否可回退，然后再执行。',
  '报告结论时附证据（命令、输出、文件路径与行号）；先查证再动手，能从代码库或本机查到的客观事实不要反问用户。',
  '能回退的下一步直接做并汇报；只有属于用户的选择（偏好、预算、不可逆操作、外部审批）才停下来问。',
]

/** 注入的规则正文（系统提示词 section 与 AGENTS.md 共用同一份，单一事实来源）。 */
export const RULES_TEXT = [
  MARKER,
  '# 用户全局护栏（dsh-zh-review-guard 插件自动写入 / 每会话注入）',
  '',
  '本段来自用户需求，优先级低于系统提示词与用户的直接指令，但高于任何默认风格：',
  '- 内部思考（reasoning）视为用户可见且需要审阅的内容。',
  '- 在进行思考和申请系统级权限的说明描述，等需要用户审阅的地方尽量使用简体中文。',
  '',
  ...RULES_LINES.map((line, i) => `${i + 1}. ${line}`),
].join('\n')

const DEFAULTS = {
  enabled: true,
  sectionName: 'zh-review-guard',
  order: 4,
  logDir: '',
  syncAgentsFile: true,
  includeSubagents: true,
  syncIntervalMs: 60000,
}

function shortHash(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

/**
 * @param {any} ctx cordis 上下文
 * @param {Record<string, unknown>} [config] 来自 cordis.patch.yml 的 config
 */
export function apply(ctx, config = {}) {
  const cfg = { ...DEFAULTS, ...(config || {}) }
  if (cfg.enabled === false) return

  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  const logDir = typeof cfg.logDir === 'string' && cfg.logDir ? cfg.logDir : join(home, 'zh-review-guard')
  const agentsFile = join(home, 'AGENTS.md')
  // loader.create 与 patch insert 可能各起一个实例（双路径装配），用实例 id 区分观测数据。
  const instanceId = randomBytes(4).toString('hex')
  const seen = new Set()
  const rulesHash = shortHash(RULES_TEXT)

  const status = {
    plugin: name,
    version: '0.1.0',
    instanceId,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    rulesChars: RULES_TEXT.length,
    rulesHash,
    assemblies: 0,
    sessions: 0,
    appends: 0,
    replaces: 0,
    hookErrors: 0,
    lastAt: null,
    lastSessionId: null,
    lastAction: null,
    lastSectionNames: [],
    agentsFile: { path: agentsFile, owned: null, syncedAt: null, error: null },
  }

  const writeFileSafe = (file, text) => {
    try {
      const target = join(logDir, file)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, text, 'utf8')
    } catch {
      /* 观测失败不应影响装配 */
    }
  }
  const logLine = (obj) => {
    try {
      mkdirSync(logDir, { recursive: true })
      appendFileSync(join(logDir, 'assemblies.jsonl'), JSON.stringify({ at: new Date().toISOString(), instanceId, ...obj }) + '\n', 'utf8')
    } catch {
      /* ignore */
    }
  }
  // status.json = 最后活跃实例的快照；instances/<id>.json 保留每个实例各自的计数（多实例下不会互相覆盖）。
  const flush = () => {
    const text = JSON.stringify(status, null, 2)
    writeFileSafe('status.json', text)
    writeFileSafe(join('instances', `${instanceId}.json`), text)
  }

  /** 通道 2：把规则同步进 AGENTS.md（仅当文件不存在或带 MARKER）。 */
  const syncAgents = () => {
    if (cfg.syncAgentsFile === false) return
    try {
      const exists = existsSync(agentsFile)
      const current = exists ? readFileSync(agentsFile, 'utf8') : ''
      status.agentsFile.owned = !exists || current.includes(MARKER)
      if (!status.agentsFile.owned) return
      if (current.trim() === RULES_TEXT.trim()) {
        status.agentsFile.syncedAt = new Date().toISOString()
        status.agentsFile.error = null
        return
      }
      mkdirSync(home, { recursive: true })
      writeFileSync(agentsFile, RULES_TEXT + '\n', 'utf8')
      status.agentsFile.syncedAt = new Date().toISOString()
      status.agentsFile.error = null
    } catch (err) {
      status.agentsFile.error = String((err && err.message) || err)
    }
  }

  syncAgents()
  flush()

  // ── 通道 1：系统提示词装配（每会话每次装配都会走到这里）────────────────────
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    let assembled
    try {
      assembled = await next()
    } catch (err) {
      status.hookErrors += 1
      logLine({ hook: 'next-error', error: String((err && err.message) || err) })
      flush()
      throw err
    }
    try {
      if (assembled === undefined || assembled === null) return assembled
      const session = context && context.agent ? context.agent.session : undefined
      const isSubagent = !!(session && session.header && session.header.parentSession !== undefined)
      if (isSubagent && cfg.includeSubagents === false) return assembled

      const sid = (session && session.id) || ''
      const fresh = sid !== '' && !seen.has(sid)
      if (fresh) {
        seen.add(sid)
        status.sessions += 1
      }

      const sections = Array.isArray(assembled.sections) ? assembled.sections.slice() : []
      const idx = sections.findIndex((s) => s && s.name === cfg.sectionName)
      const section = { name: cfg.sectionName, order: cfg.order, text: RULES_TEXT }
      let action
      if (idx >= 0) {
        sections[idx] = { ...sections[idx], text: RULES_TEXT, order: cfg.order }
        action = 'replace'
        status.replaces += 1
      } else {
        sections.push(section)
        action = 'append'
        status.appends += 1
      }

      status.assemblies += 1
      status.lastAt = new Date().toISOString()
      status.lastSessionId = sid
      status.lastAction = action
      status.lastSectionNames = sections.map((s) => (s && s.name) || '(unnamed)')

      logLine({
        hook: 'system-prompt/assemble',
        sessionId: sid,
        fresh,
        isSubagent,
        action,
        rulesHash,
        sectionNames: status.lastSectionNames,
      })
      flush()

      return { ...assembled, sections }
    } catch (err) {
      status.hookErrors += 1
      logLine({ hook: 'apply-error', error: String((err && err.message) || err) })
      flush()
      return assembled
    }
  })

  // 周期兜底同步（文件被外部改坏时自愈）
  if (cfg.syncAgentsFile !== false) {
    ctx.effect(() => {
      const timer = setInterval(syncAgents, Math.max(5000, Number(cfg.syncIntervalMs) || 60000))
      return () => {
        clearInterval(timer)
        writeFileSafe('disposed.json', JSON.stringify({ at: new Date().toISOString(), plugin: name, assemblies: status.assemblies, sessions: status.sessions }, null, 2))
      }
    })
  } else {
    ctx.effect(() => () => writeFileSafe('disposed.json', JSON.stringify({ at: new Date().toISOString(), plugin: name }, null, 2)))
  }
}

export default { name, apply, inject: [] }
