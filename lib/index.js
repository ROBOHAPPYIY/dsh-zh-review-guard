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
 * v0.2.0 新增两件事：
 *   1) 主通道失败可发现：心跳（heartbeat）+ 活动锚点对比。
 *      纯靠监听，一旦上游改了事件名或 waterfall 契约，「注册成功但永不触发」是静默的，
 *      插件看起来仍然健康。这里用「会话目录确实在新增/写入，而本实例从未装配过」作为
 *      强证据，把静默失效变成 health.json 里的一条 stale 记录与控制台一次告警。
 *   2) 规则可配置：内置 7 条为默认基线，可用 $DSH_HOME/zh-review-guard/rules.md
 *      以 append（默认，追加在本机）或 replace（整段替换规则正文）方式扩展，
 *      文件改动会被周期 tick 发现并热更新。最终文本仍是唯一事实来源：
 *      section 注入与 AGENTS.md 用的是同一份，哈希也取自最终文本。
 *
 * 可观测性（用于自证「每个会话都调用了」）：
 *   $DSH_HOME/zh-review-guard/assemblies.jsonl  每次装配一行（会话 id / 是否新会话 / 动作 / 段名清单 / 规则哈希）
 *   $DSH_HOME/zh-review-guard/status.json       累计计数与最近一次装配摘要
 *   $DSH_HOME/zh-review-guard/health.json       心跳与主通道健康判定（stale 判定结果与理由）
 *   $DSH_HOME/zh-review-guard/instances/<id>.json  每个实例各自的计数（多实例不互相覆盖）
 *
 * 无第三方依赖（仅 node: 内置模块），因此没有编译步骤。
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'

export const name = 'dsh-zh-review-guard'

/** 包版本（写入 status.json 与归属标记）。 */
export const VERSION = '0.2.0'

/** 归属标记前缀：跨版本稳定，用于认领判定。 */
export const MARKER_PREFIX = '<!-- managed-by: dsh-zh-review-guard'

/** 归属标记：只有含该标记的 AGENTS.md 才由本插件接管（避免覆盖用户手写内容）。 */
export const MARKER = `${MARKER_PREFIX} v${VERSION} -->`

/** 执行口径（内置基线；可被 rules.md 追加或替换）。 */
export const RULES_LINES = [
  '内部思考（reasoning / thinking）一律使用简体中文。',
  '内部思考视为用户可见、需要审阅的内容：给出结论之前，写清目标理解、方案取舍、为什么选 A 而不选 B、风险与不确定之处、尚未解决的问题，而不是只给结论。',
  '需要用户拍板或复核的地方（方案选择、不可逆操作、外部审批），明确写出「这是需要你确认的点」。',
  '面向用户的说明、汇报、提问、交付说明一律使用简体中文；代码、命令、路径、专有名词保留原文。',
  '申请系统级权限（沙箱升级、网络/文件系统访问、安装依赖、审批弹窗）或执行不可逆操作前，先用简体中文说明：要做什么、为什么需要、影响范围、是否可回退，然后再执行。',
  '报告结论时附证据（命令、输出、文件路径与行号）；先查证再动手，能从代码库或本机查到的客观事实不要反问用户。',
  '能回退的下一步直接做并汇报；只有属于用户的选择（偏好、预算、不可逆操作、外部审批）才停下来问。',
]

/** 注入段标题（单一事实来源的一部分）。 */
export const RULES_TITLE = '# 用户全局护栏（dsh-zh-review-guard 插件自动写入 / 每会话注入）'

/** 注入段前言。 */
export const RULES_INTRO = [
  '本段来自用户需求，优先级低于系统提示词与用户的直接指令，但高于任何默认风格：',
  '- 内部思考（reasoning）视为用户可见且需要审阅的内容。',
  '- 在进行思考和申请系统级权限的说明描述，等需要用户审阅的地方尽量使用简体中文。',
].join('\n')

/** 内置默认规则正文（系统提示词 section 与 AGENTS.md 共用同一份，单一事实来源）。 */
export const RULES_TEXT = [
  MARKER,
  RULES_TITLE,
  '',
  RULES_INTRO,
  '',
  ...RULES_LINES.map((line, i) => `${i + 1}. ${line}`),
].join('\n')

/** 内置基线文本，不随 rules.md 变化（供外部引用与自测比对）。 */
export const RULES_BASELINE = RULES_TEXT

const DEFAULTS = {
  enabled: true,
  sectionName: 'zh-review-guard',
  order: 4,
  logDir: '',
  syncAgentsFile: true,
  includeSubagents: true,
  syncIntervalMs: 60000,
  // 规则扩展（v0.2.0）
  rulesFile: '',
  rulesMode: 'append',
  rulesMaxChars: 12000,
  // 主通道健康检查（v0.2.0）
  healthCheck: true,
  staleGraceMs: 120000,
  staleLagMs: 7200000,
}

/** 事件名常量（契约自检与调试引用同一份，避免两处字符串漂移）。 */
export const ASSEMBLE_EVENT = 'system-prompt/assemble'

function shortHash(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

/** $DSH_HOME（与 DSH 本体一致的解析顺序）。 */
export function defaultHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/**
 * 解析最终规则正文：内置基线 + 可选的 rules.md（append / replace）。
 * 纯函数（除读文件外无副作用），便于自测。
 *
 * @param {{home?:string,file?:string,mode?:'append'|'replace'|'off',maxChars?:number}} [o]
 * @returns {{text:string,source:'builtin'|'builtin+file'|'file',mode:string,file:string,filePresent:boolean,chars:number,hash:string,error:string|null,truncated:boolean}}
 */
export function resolveRules(o = {}) {
  const home = o.home || defaultHome()
  const mode = o.mode === 'replace' || o.mode === 'off' ? o.mode : 'append'
  const file = typeof o.file === 'string' && o.file ? o.file : join(home, 'zh-review-guard', 'rules.md')
  const maxChars = Number(o.maxChars) > 0 ? Number(o.maxChars) : DEFAULTS.rulesMaxChars

  const out = {
    text: RULES_BASELINE,
    source: 'builtin',
    mode,
    file,
    filePresent: false,
    chars: RULES_BASELINE.length,
    hash: shortHash(RULES_BASELINE),
    error: null,
    truncated: false,
  }
  if (mode === 'off') return out

  let raw = ''
  try {
    if (!existsSync(file)) return out
    out.filePresent = true
    raw = readFileSync(file, 'utf8')
  } catch (err) {
    out.error = 'read: ' + String((err && err.message) || err)
    return out
  }

  let extra = raw.replace(/^\uFEFF/, '').trim()
  if (!extra) return out
  if (extra.length > maxChars) {
    extra = extra.slice(0, maxChars)
    out.truncated = true
    out.error = `truncated to ${maxChars} chars`
  }

  if (mode === 'replace') {
    // 用户提供的正文替换内置规则清单；仍保留 MARKER（认领判定依赖它）与标题。
    out.text = [MARKER, RULES_TITLE, '', extra].join('\n')
    out.source = 'file'
  } else {
    out.text = `${RULES_BASELINE}\n\n## 本机追加规则\n\n${extra}`
    out.source = 'builtin+file'
  }
  out.chars = out.text.length
  out.hash = shortHash(out.text)
  return out
}

/**
 * 扫描 $DSH_HOME/sessions/<工作区>/<会话 id>/ 目录，得到「世界是否在动」的客观锚点。
 * 只读；任何异常都降级为 error 字段，绝不抛出（健康检查不能自己把插件搞挂）。
 *
 * @param {string} home
 * @param {{sinceMs?:number}} [opts] sinceMs：会话目录创建时间晚于它的个数计入 newDirsSince
 */
export function scanSessions(home, opts = {}) {
  const root = join(home, 'sessions')
  const res = { root, count: 0, newestMtimeMs: 0, newDirsSince: 0, error: null }
  try {
    if (!existsSync(root)) return res
    for (const ws of readdirSync(root, { withFileTypes: true })) {
      if (!ws.isDirectory()) continue
      let sessionDirs = []
      try {
        sessionDirs = readdirSync(join(root, ws.name), { withFileTypes: true })
      } catch {
        continue
      }
      for (const sd of sessionDirs) {
        if (!sd.isDirectory()) continue
        res.count += 1
        const dir = join(root, ws.name, sd.name)
        let birth = 0
        let newest = 0
        try {
          const st = statSync(dir)
          birth = st.birthtimeMs || st.ctimeMs || 0
          newest = st.mtimeMs
        } catch {
          continue
        }
        try {
          for (const f of readdirSync(dir, { withFileTypes: true })) {
            if (!f.isFile()) continue
            try {
              const fst = statSync(join(dir, f.name))
              if (fst.mtimeMs > newest) newest = fst.mtimeMs
            } catch {
              /* 单个文件读不到不影响整体判定 */
            }
          }
        } catch {
          /* ignore */
        }
        if (newest > res.newestMtimeMs) res.newestMtimeMs = newest
        const since = Number(opts.sinceMs)
        if (Number.isFinite(since) && birth > since) res.newDirsSince += 1
      }
    }
  } catch (err) {
    res.error = String((err && err.message) || err)
  }
  return res
}

/**
 * 主通道健康判定（纯函数，便于自测）。
 *
 * 强证据：加载之后确实有新会话目录出现，但本实例一次都没被装配过 —— 说明监听没生效
 * （事件改名、waterfall 契约变化、插件没真正加载等），此时通道 1 已死。
 * 弱证据：最近仍有会话活动，而心跳已经滞后很久。
 *
 * 新装机器（本机还没有任何会话）不会被判 stale —— 没有"世界在动"的证据就不下结论。
 */
export function evaluateHealth(input) {
  const reasons = []
  const now = Number(input.nowMs) || 0
  const load = Number(input.loadMs) || 0
  const age = Math.max(0, now - load)
  const graceMs = Number(input.graceMs) || 0
  const lagMs = Number(input.lagMs) || DEFAULTS.staleLagMs
  const seen = input.sessionsSeen || {}
  const assemblies = Number(input.assemblies) || 0

  if (age < graceMs) return { stale: false, level: 'warming', reasons: [`age<grace(${graceMs}ms)`] }

  if ((seen.newDirsSince || 0) > 0 && assemblies === 0) {
    reasons.push(`new-sessions-since-load(${seen.newDirsSince})-but-zero-assemblies`)
    return { stale: true, level: 'stale', reasons }
  }

  const lastAssembleMs = Number(input.lastAssembleMs) || 0
  if (lastAssembleMs > 0) {
    const lag = now - lastAssembleMs
    const activeRecently = (seen.newestMtimeMs || 0) > 0 && now - seen.newestMtimeMs < lagMs
    if (activeRecently && lag > lagMs) {
      reasons.push(`heartbeat-lag-${Math.round(lag / 1000)}s-with-active-sessions`)
      return { stale: true, level: 'stale', reasons }
    }
    return { stale: false, level: 'ok', reasons: [`assemblies=${assemblies}`, `lag=${Math.round(lag / 1000)}s`] }
  }

  return { stale: false, level: 'idle', reasons: ['no-assembly-since-load', `sessions-seen=${seen.count || 0}`] }
}

/** best-effort 事件反射：能找到事件清单就确认事件名存在，找不到就返回 null（不下结论）。 */
function probeEventKnown(ctx, eventName) {
  try {
    const bags = []
    if (ctx) {
      bags.push(ctx.events, ctx.registry && ctx.registry.events, ctx.scope && ctx.scope.events)
      if (ctx.root) bags.push(ctx.root.events, ctx.root.registry && ctx.root.registry.events)
    }
    for (const bag of bags) {
      if (!bag) continue
      if (typeof bag.has === 'function' && bag.has(eventName)) return true
      if (typeof bag.keys === 'function') {
        try {
          if ([...bag.keys()].includes(eventName)) return true
        } catch {
          /* ignore */
        }
      }
      if (typeof bag === 'object' && Object.prototype.hasOwnProperty.call(bag, eventName)) return true
    }
  } catch {
    /* ignore */
  }
  return null
}

/**
 * @param {any} ctx cordis 上下文
 * @param {Record<string, unknown>} [config] 来自 cordis.patch.yml 的 config
 */
export function apply(ctx, config = {}) {
  const cfg = { ...DEFAULTS, ...(config || {}) }
  if (cfg.enabled === false) return

  const home = defaultHome()
  const logDir = typeof cfg.logDir === 'string' && cfg.logDir ? cfg.logDir : join(home, 'zh-review-guard')
  const agentsFile = join(home, 'AGENTS.md')
  // loader.create 与 patch insert 可能各起一个实例（双路径装配），用实例 id 区分观测数据。
  const instanceId = randomBytes(4).toString('hex')
  const seen = new Set()
  const loadMs = Date.now()
  const rulesFile = typeof cfg.rulesFile === 'string' && cfg.rulesFile ? cfg.rulesFile : join(home, 'zh-review-guard', 'rules.md')

  // 规则正文按实例解析（依赖 home/cfg），最终文本与哈希始终成对更新。
  let rules = resolveRules({ home, file: rulesFile, mode: cfg.rulesMode, maxChars: cfg.rulesMaxChars })
  let rulesMtimeMs = 0
  try {
    rulesMtimeMs = existsSync(rulesFile) ? statSync(rulesFile).mtimeMs : 0
  } catch {
    rulesMtimeMs = 0
  }

  const describeRules = (r) => ({
    source: r.source,
    mode: r.mode,
    file: r.file,
    filePresent: r.filePresent,
    chars: r.chars,
    hash: r.hash,
    truncated: r.truncated,
    error: r.error,
  })

  const status = {
    plugin: name,
    version: VERSION,
    instanceId,
    pid: process.pid,
    startedAt: new Date(loadMs).toISOString(),
    rulesChars: rules.chars,
    rulesHash: rules.hash,
    rules: describeRules(rules),
    rulesReloads: 0,
    assemblies: 0,
    sessions: 0,
    appends: 0,
    replaces: 0,
    hookErrors: 0,
    lastAt: null,
    lastAssembleMs: null,
    lastSessionId: null,
    lastAction: null,
    lastSectionNames: [],
    agentsFile: { path: agentsFile, owned: null, syncedAt: null, error: null },
    contract: { event: ASSEMBLE_EVENT, onAvailable: typeof ctx.on === 'function', registerOk: false, eventKnown: null, error: null },
    health: { level: 'warming', stale: false, reasons: ['not-checked-yet'], checkedAt: null },
    sessionsSeen: { root: join(home, 'sessions'), count: 0, newDirsSince: 0, newestMtimeMs: 0, error: null },
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
      // 用「前缀」判定而不是完整 MARKER：老版本写入的标记在升级后仍被认领，可就地升级为当前文本。
      status.agentsFile.owned = !exists || current.includes(MARKER_PREFIX)
      if (!status.agentsFile.owned) return
      if (current.trim() === rules.text.trim()) {
        status.agentsFile.syncedAt = new Date().toISOString()
        status.agentsFile.error = null
        return
      }
      mkdirSync(home, { recursive: true })
      writeFileSync(agentsFile, rules.text + '\n', 'utf8')
      status.agentsFile.syncedAt = new Date().toISOString()
      status.agentsFile.error = null
    } catch (err) {
      status.agentsFile.error = String((err && err.message) || err)
    }
  }

  /** rules.md 变更后热更新（mtime 变化才重解析），并立刻重新同步通道 2。 */
  const refreshRules = (force) => {
    let mtime = 0
    try {
      mtime = existsSync(rulesFile) ? statSync(rulesFile).mtimeMs : 0
    } catch {
      mtime = 0
    }
    if (!force && mtime === rulesMtimeMs) return false
    const next = resolveRules({ home, file: rulesFile, mode: cfg.rulesMode, maxChars: cfg.rulesMaxChars })
    rulesMtimeMs = mtime
    if (next.hash === rules.hash) return false
    rules = next
    status.rules = describeRules(rules)
    status.rulesChars = rules.chars
    status.rulesHash = rules.hash
    status.rulesReloads += 1
    logLine({ hook: 'rules-reloaded', source: rules.source, rulesHash: rules.hash, chars: rules.chars, error: rules.error })
    syncAgents()
    flush()
    return true
  }

  let staleWarned = false
  /** 心跳与主通道健康判定：写 health.json，stale 时告警一次。 */
  const checkHealth = () => {
    if (cfg.healthCheck === false) return
    const now = Date.now()
    const scan = scanSessions(home, { sinceMs: loadMs })
    status.sessionsSeen = { root: scan.root, count: scan.count, newDirsSince: scan.newDirsSince, newestMtimeMs: scan.newestMtimeMs, error: scan.error }
    const verdict = evaluateHealth({
      loadMs,
      nowMs: now,
      assemblies: status.assemblies,
      lastAssembleMs: status.lastAssembleMs,
      sessionsSeen: scan,
      graceMs: Number(cfg.staleGraceMs) || DEFAULTS.staleGraceMs,
      lagMs: Number(cfg.staleLagMs) || DEFAULTS.staleLagMs,
    })
    status.health = { ...verdict, checkedAt: new Date(now).toISOString(), ageMs: now - loadMs }
    writeFileSafe(
      'health.json',
      JSON.stringify(
        {
          plugin: name,
          version: VERSION,
          instanceId,
          pid: process.pid,
          loadedAt: status.startedAt,
          checkedAt: status.health.checkedAt,
          ageMs: now - loadMs,
          assemblies: status.assemblies,
          sessions: status.sessions,
          lastAssembleAt: status.lastAt,
          lastAssembleMs: status.lastAssembleMs,
          hookErrors: status.hookErrors,
          contract: status.contract,
          sessionsSeen: status.sessionsSeen,
          verdict,
        },
        null,
        2,
      ),
    )
    if (verdict.stale && !staleWarned) {
      staleWarned = true
      logLine({ hook: 'health-stale', level: verdict.level, reasons: verdict.reasons })
      try {
        console.warn(`[${name}] 主通道疑似失效：${verdict.reasons.join(', ')}；详见 ${join(logDir, 'health.json')}`)
      } catch {
        /* ignore */
      }
    }
    flush()
  }

  syncAgents()
  flush()

  // ── 通道 1：系统提示词装配（每会话每次装配都会走到这里）────────────────────
  const onAssemble = async (_assembly, context, next) => {
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
      const section = { name: cfg.sectionName, order: cfg.order, text: rules.text }
      let action
      if (idx >= 0) {
        sections[idx] = { ...sections[idx], text: rules.text, order: cfg.order }
        action = 'replace'
        status.replaces += 1
      } else {
        sections.push(section)
        action = 'append'
        status.appends += 1
      }

      const nowMs = Date.now()
      status.assemblies += 1
      status.lastAt = new Date(nowMs).toISOString()
      status.lastAssembleMs = nowMs
      status.lastSessionId = sid
      status.lastAction = action
      status.lastSectionNames = sections.map((s) => (s && s.name) || '(unnamed)')

      logLine({
        hook: ASSEMBLE_EVENT,
        sessionId: sid,
        fresh,
        isSubagent,
        action,
        rulesHash: rules.hash,
        rulesSource: rules.source,
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
  }

  // 契约自检：注册成功与否本身是证据（上游若删掉事件，注册可能不再报错但仍永不触发 —— 那由 health 心跳兜住）。
  try {
    ctx.on(ASSEMBLE_EVENT, onAssemble)
    status.contract.registerOk = true
  } catch (err) {
    status.contract.registerOk = false
    status.contract.error = String((err && err.message) || err)
    status.hookErrors += 1
    logLine({ hook: 'register-error', error: status.contract.error })
  }
  status.contract.eventKnown = probeEventKnown(ctx, ASSEMBLE_EVENT)
  flush()

  // 周期兜底：通道 2 自愈 + rules.md 热更新 + 主通道心跳
  const needTick = cfg.syncAgentsFile !== false || cfg.healthCheck !== false || cfg.rulesMode !== 'off'
  if (needTick) {
    ctx.effect(() => {
      const timer = setInterval(() => {
        try {
          refreshRules(false)
        } catch {
          /* ignore */
        }
        try {
          syncAgents()
        } catch {
          /* ignore */
        }
        try {
          checkHealth()
        } catch {
          /* ignore */
        }
      }, Math.max(5000, Number(cfg.syncIntervalMs) || 60000))
      return () => {
        clearInterval(timer)
        writeFileSafe('disposed.json', JSON.stringify({ at: new Date().toISOString(), plugin: name, assemblies: status.assemblies, sessions: status.sessions }, null, 2))
      }
    })
  } else {
    ctx.effect(() => () => writeFileSafe('disposed.json', JSON.stringify({ at: new Date().toISOString(), plugin: name, assemblies: status.assemblies, sessions: status.sessions }, null, 2)))
  }
}

export default { name, apply, inject: [] }
