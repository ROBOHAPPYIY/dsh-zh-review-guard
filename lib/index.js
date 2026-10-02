/**
 * dsh-zh-review-guard —— 用户级「内部思考可见 + 简体中文」护栏（DSH bundle 插件）。
 *
 * 设计目标：把「用户需求」变成底层机制，而不是一个可能被忘记/覆盖的文档约定 ——
 * 所有新会话在装配系统提示词时都会被调用，规则常驻。
 *
 * 两条互相独立的通道，任一通道即可让规则在每个会话生效：
 *   通道 1（主）：'system-prompt/assemble' waterfall（官方注入点，Waterfall 必须
 *     await next() 后再改）。把用户需求段作为常驻 section 注入；不受上下文压缩影响。
 *   通道 2（备）：把规则同步到 $DSH_HOME/AGENTS.md —— 由
 *     @deepseek-ai/dsh-agent-instructions 在会话首个合格 pre-step 作为持久基线注入。
 *     默认只写「精简兜底版」（v0.2.2 的 agentsDigestLines，默认前 2 条内置规则）：
 *     两条通道各注一份全文等于每轮付两份 token，而完整正文已经由通道 1 注入。
 *     仅接管「整份内容就是本插件写的」文件（见 isPluginOwnedText / isPluginDigestText）；
 *     只要文件里还有用户自己的内容，哪怕出现过 MARKER 片段也一概不动，并在
 *     status.agentsFile 留痕。
 *
 * v0.2.2 新增：通道 2（AGENTS.md）默认只写精简兜底版，降低重复注入的 token 开销。
 *   背景：两条通道各注入一份规则（≈538 tokens/轮 → 合计 ≈1076 tokens/轮），但通道 2
 *   不能直接关 —— 通道 1 是 'system-prompt/assemble' waterfall 上的一环，链上任何插件
 *   重建 sections 都会把我们的段静默丢掉（实测 @local/dsh-router-presets 的 standard
 *   模式即如此，且本插件察觉不到：assemblies 照增、health 仍判 ok）。
 *   做法：新增配置 agentsDigestLines（默认 2）—— AGENTS.md 只写「标记 + 一句说明 +
 *   前 N 条内置规则」；系统提示词 section 仍注入完整正文（rules.md 的追加内容只进通道 1）。
 *   设 agentsDigestLines: 0 可恢复「整份全文」的旧行为。
 *   兼容：认领判定同时接受精简兜底版与完整正文，v0.2.1 写下的全文文件会被认领并就地
 *   降级为精简版（覆盖前照旧备份）。
 *
 * v0.2.1 修复（代码审计发现，全部为行为收紧，无破坏性变更）：
 *   1) 覆盖保护：认领判定由「含标记前缀」改为「归一化后整份文本比对」。
 *      原先只要文件里出现 `<!-- managed-by: dsh-zh-review-guard` 就被判为可接管，
 *      粘贴过标记片段/从别的机器拷来的 AGENTS.md 会被整体覆盖且无备份（不可逆）。
 *      现在这类文件一律保留（reason='kept-user-content'）。
 *   2) 覆盖前备份：被替换掉的旧内容先存 backups/AGENTS.md.<时间戳>.bak（保留 5 份）。
 *   3) 磁盘卫生：assemblies.jsonl 超过 maxLogBytes 轮转为 .1；instances/ 按 TTL 与
 *      数量上限清理（pruneInstances），不再无界增长。
 *   4) 降低暴露面：日志与状态默认只记 section 数量与名称哈希，不落宿主全部 section 名
 *      （需要时用 recordSectionNames: true 打开）。
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

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'

export const name = 'dsh-zh-review-guard'

/** 包版本（写入 status.json 与归属标记）。 */
export const VERSION = '0.2.2'

/** 归属标记前缀：跨版本稳定，用于认领判定。 */
export const MARKER_PREFIX = '<!-- managed-by: dsh-zh-review-guard'

/**
 * 归属标记：认领判定依赖「整份文本就是我们写的那份」，而不是「文本里出现过标记」
 * （v0.2.1 修复：只看前缀会把用户粘贴过标记片段的 AGENTS.md 误判为可接管，
 * 下一次 tick 就把用户手写内容整体覆盖且无备份；判定逻辑见 isPluginOwnedText）。
 */
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

/** 精简兜底版标题（v0.2.2：通道 2 专用，刻意短于 section 版标题）。 */
export const RULES_DIGEST_TITLE = '# 用户全局护栏（精简兜底版）'

/** 精简兜底版前言：点明完整规则在系统提示词里，本文件只保证最低限度不失效。 */
export const RULES_DIGEST_INTRO = '完整规则由插件注入系统提示词；本文件是兜底精简版。'

/**
 * 生成通道 2（AGENTS.md）的精简兜底文本。
 *
 * v0.2.2：两条通道各注入一份全文 ≈538 tokens/轮（重复 ≈1076），而通道 2 不能关
 * （通道 1 依赖 waterfall，上游插件重建 sections 时我们的段会静默丢失）。折中办法是
 * 通道 2 只写「标记 + 前言 + 前 lineCount 条内置规则」：兜底仍在，体积大幅下降。
 *
 * @param {number} lineCount 写入的内置规则条数；<=0 或非数字时返回完整正文（旧行为）
 * @returns {string} 不含结尾换行的文本
 */
export function buildAgentsDigestText(lineCount) {
  const n = Math.floor(Number(lineCount))
  if (!(n > 0)) return RULES_TEXT
  const lines = RULES_LINES.slice(0, Math.min(n, RULES_LINES.length))
  return [MARKER, RULES_DIGEST_TITLE, '', RULES_DIGEST_INTRO, '', ...lines.map((line, i) => `${i + 1}. ${line}`)].join('\n')
}

/**
 * 判断 AGENTS.md 的现有内容是否为「本插件的精简兜底版」（任意条数）。
 *
 * 为什么不复用 isPluginOwnedText：精简版的条数由 agentsDigestLines 决定，改配置后
 * 上一次写下的条数就与当前期望不符；若只按当前条数比对，插件会把自己写的文件误判成
 * 用户内容而拒绝更新。这里改为结构化识别：标记 + 固定标题 + 固定前言 + 与内置规则
 * 逐字相等且序号连续的前缀。任何额外/改动过的内容都不算。
 *
 * @param {string} current 磁盘上的现有内容
 * @returns {boolean}
 */
export function isPluginDigestText(current) {
  const norm = (s) => String(s == null ? '' : s).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  const canonMarker = (s) => norm(s).replace(/<!--\s*managed-by:\s*dsh-zh-review-guard[^>]*-->/g, MARKER_PREFIX)
  const cur = norm(current)
  if (!cur) return false
  const lines = cur.split('\n').map((l) => l.trim())
  if (canonMarker(lines[0]) !== MARKER_PREFIX) return false
  if (lines[1] !== RULES_DIGEST_TITLE || lines[2] !== '' || lines[3] !== RULES_DIGEST_INTRO || lines[4] !== '') return false
  const body = lines.slice(5).filter((l) => l !== '')
  if (body.length === 0 || body.length > RULES_LINES.length) return false
  return body.every((l, i) => l === `${i + 1}. ${RULES_LINES[i]}`)
}

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
  // 覆盖保护与磁盘卫生（v0.2.1）
  backupAgentsFile: true, // 覆盖 AGENTS.md 前先备份被替换的内容
  agentsBackupKeep: 5, // 备份保留份数（超出按 mtime 删最旧）
  maxLogBytes: 2000000, // assemblies.jsonl 超过该体积就轮转为 .1（只保留一代）
  instancesTtlMs: 604800000, // instances/*.json 超过该年龄即清理（默认 7 天）
  instancesMaxFiles: 20, // instances/ 文件数上限（超出按 mtime 保留最新）
  recordSectionNames: false, // 是否把宿主全部 section 名写进日志/状态（默认只记数量与哈希）
  // 通道 2 减重（v0.2.2）
  agentsDigestLines: 2, // AGENTS.md 只写前 N 条内置规则（精简兜底版）；0 = 写整份全文（旧行为）
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
 * 判断 AGENTS.md 的现有内容是否「整份就是本插件生成的那份」。
 *
 * v0.2.1 修复点：认领判定此前只看文件里是否出现 MARKER_PREFIX，于是用户
 * 粘贴过标记片段、或从别的机器拷来带标记的文件，都会被判为「可接管」，
 * 下一次 tick 就把用户手写内容整体覆盖（无备份、不可逆）。
 * 现在改为归一化后整体比对：CRLF/首尾空白，以及标记行中的版本号
 * （保证 v0.1.x/v0.2.0 写下的文件在升级后仍被认领并就地升级）。
 * 任何额外内容都会让比对失败 —— 此时不接管、不覆盖，只记录原因。
 *
 * @param {string} current 磁盘上的现有内容
 * @param {string|string[]} expected 插件可能写入的正文（不含结尾换行），可给多个候选
 *   （v0.2.2：精简兜底版与完整正文都算「本插件写的」，避免开关 agentsDigestLines 时
 *   把自己上一次写的文件误判成用户内容而拒绝更新）
 * @returns {boolean}
 */
export function isPluginOwnedText(current, expected) {
  const norm = (s) => String(s == null ? '' : s).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  const canon = (s) => norm(s).replace(/<!--\s*managed-by:\s*dsh-zh-review-guard[^>]*-->/g, MARKER_PREFIX)
  const cur = norm(current)
  if (!cur) return true // 空文件等同于不存在：可以创建
  const candidates = (Array.isArray(expected) ? expected : [expected]).filter((e) => norm(e))
  if (candidates.length === 0) return false
  const curCanon = canon(cur)
  return candidates.some((e) => canon(e) === curCanon)
}

/**
 * 日志轮转：文件体积达到 maxBytes 就改名为 <file>.1（只保留一代），返回是否发生轮转。
 * 独立导出便于自测；任何失败都返回 false，绝不影响 append。
 *
 * @param {string} file
 * @param {number} [maxBytes]
 * @returns {boolean}
 */
export function rotateLogFile(file, maxBytes) {
  try {
    const max = Number(maxBytes) > 0 ? Number(maxBytes) : DEFAULTS.maxLogBytes
    if (!existsSync(file)) return false
    if (statSync(file).size < max) return false
    const prev = file + '.1'
    try {
      if (existsSync(prev)) unlinkSync(prev)
    } catch {
      /* 旧归档删不掉也不该阻断轮转 */
    }
    renameSync(file, prev)
    return true
  } catch {
    return false
  }
}

/**
 * instances/ 清理：按 TTL 与数量上限删除旧实例快照（keepFile 指定的当前实例永不删）。
 * 独立导出（纯目录操作）便于自测。
 *
 * @param {string} dir
 * @param {{ttlMs?:number,maxFiles?:number,keepFile?:string,nowMs?:number}} [o]
 * @returns {{removed:number,kept:number}}
 */
export function pruneInstancesDir(dir, o = {}) {
  const res = { removed: 0, kept: 0 }
  try {
    if (!existsSync(dir)) return res
    const ttl = Number(o.ttlMs) > 0 ? Number(o.ttlMs) : DEFAULTS.instancesTtlMs
    const maxFiles = Number(o.maxFiles) > 0 ? Number(o.maxFiles) : DEFAULTS.instancesMaxFiles
    const keepFile = o.keepFile ? String(o.keepFile) : ''
    const now = Number(o.nowMs) > 0 ? Number(o.nowMs) : Date.now()
    const entries = readdirSync(dir)
      .filter((f) => f.endsWith('.json') && f !== keepFile)
      .map((f) => {
        try {
          return { f, m: statSync(join(dir, f)).mtimeMs }
        } catch {
          return { f, m: 0 }
        }
      })
      .sort((a, b) => b.m - a.m)
    entries.forEach((item, i) => {
      const expired = ttl > 0 && now - item.m > ttl
      const overCap = i >= Math.max(1, maxFiles)
      if (!expired && !overCap) return
      try {
        unlinkSync(join(dir, item.f))
        res.removed += 1
      } catch {
        /* ignore */
      }
    })
    res.kept = entries.length - res.removed
  } catch {
    /* 清理失败不算错误 */
  }
  return res
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
    lastSectionNames: null, // 仅当 cfg.recordSectionNames 为真才填（默认只记数量与哈希，避免宿主内部结构落盘）
    lastSectionCount: null,
    lastSectionNamesHash: null,
    instancesPruned: 0,
    logRotations: 0,
    agentsFile: { path: agentsFile, owned: null, ownedBy: null, reason: null, userContentKept: false, backup: null, syncedAt: null, skippedAt: null, error: null, digestLines: null, digestChars: null },
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
  /** 装配日志体积控制：超过 maxLogBytes 就把 assemblies.jsonl 轮转为 .1（只保留一代）。 */
  const rotateLog = (file) => {
    if (rotateLogFile(file, cfg.maxLogBytes)) status.logRotations = (Number(status.logRotations) || 0) + 1
  }
  const logLine = (obj) => {
    try {
      mkdirSync(logDir, { recursive: true })
      const file = join(logDir, 'assemblies.jsonl')
      rotateLog(file)
      appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), instanceId, ...obj }) + '\n', 'utf8')
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

  /**
   * 所有权证据（agents-state.json）：记录「本插件上一次写入 AGENTS.md 的整份内容哈希」。
   * 为什么需要它：只靠内容比对无法区分
   *   (a) 插件自己上次写的文本，因 rules.md 变化而变成「过期版本」——应当允许覆盖更新；
   *   (b) 用户把自己的规则写进文件——绝对不许覆盖。
   * 两者的内容都不等于「当前期望文本」，但只有 (a) 的哈希与状态文件一致。
   * 老版本没有状态文件时，回退到 isPluginOwnedText（仅版本号不同的情形仍可升级）。
   */
  const agentsStateFile = join(logDir, 'agents-state.json')
  const readAgentsState = () => {
    try {
      return JSON.parse(readFileSync(agentsStateFile, 'utf8'))
    } catch {
      return null
    }
  }
  const writeAgentsState = (content) =>
    writeFileSafe(
      'agents-state.json',
      JSON.stringify({ plugin: name, version: VERSION, path: agentsFile, hash: shortHash(content), chars: content.length, at: new Date().toISOString() }, null, 2),
    )

  /**
   * 覆盖前备份：把即将被替换的 AGENTS.md 内容存到
   * $DSH_HOME/zh-review-guard/backups/AGENTS.md.<时间戳>.bak，并按 agentsBackupKeep 删最旧。
   * 返回备份文件名（失败返回 null）—— 备份失败不阻断覆盖，但会在 status 里留痕。
   */
  const backupAgents = (current) => {
    if (cfg.backupAgentsFile === false || !current || !current.trim()) return null
    try {
      const dir = join(logDir, 'backups')
      mkdirSync(dir, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupName = `AGENTS.md.${stamp}.bak`
      writeFileSync(join(dir, backupName), current, 'utf8')
      const keep = Number(cfg.agentsBackupKeep) > 0 ? Number(cfg.agentsBackupKeep) : DEFAULTS.agentsBackupKeep
      try {
        const files = readdirSync(dir)
          .filter((f) => f.startsWith('AGENTS.md.') && f.endsWith('.bak'))
          .map((f) => ({ f, m: statSync(join(dir, f)).mtimeMs }))
          .sort((a, b) => b.m - a.m)
        for (const item of files.slice(keep)) {
          try {
            unlinkSync(join(dir, item.f))
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* 清理失败不影响备份本身 */
      }
      return backupName
    } catch {
      return null
    }
  }

  /** instances/ 清理：按 TTL 与数量上限删除旧实例快照（永不删当前实例）。 */
  const pruneInstances = () => {
    const r = pruneInstancesDir(join(logDir, 'instances'), {
      ttlMs: cfg.instancesTtlMs,
      maxFiles: cfg.instancesMaxFiles,
      keepFile: `${instanceId}.json`,
    })
    if (r.removed > 0) status.instancesPruned = (Number(status.instancesPruned) || 0) + r.removed
    return r.removed
  }

  /**
   * 通道 2：把规则同步进 AGENTS.md。
   * 只在「文件不存在 / 空白 / 内容整份就是本插件写的（含历史版本）」时才写入；
   * 一旦发现用户自己的内容（哪怕文件里出现过标记片段），立刻停手并留痕，绝不覆盖。
   */
  const syncAgents = () => {
    if (cfg.syncAgentsFile === false) return
    try {
      const exists = existsSync(agentsFile)
      const current = exists ? readFileSync(agentsFile, 'utf8') : ''
      // v0.2.2：通道 2 默认只写精简兜底版（agentsDigestLines 条内置规则），
      // 通道 1 始终注入完整正文（rules.text，含 rules.md 追加内容）。
      const digestLines = Number(cfg.agentsDigestLines) > 0 ? Math.floor(Number(cfg.agentsDigestLines)) : 0
      const channelText = digestLines > 0 ? buildAgentsDigestText(digestLines) : rules.text
      const expected = channelText + '\n'
      const state = readAgentsState()
      const ownedByState = !!(state && state.hash && current && state.hash === shortHash(current))
      // 完整正文与精简兜底版（任意条数）都算「自己写的」：
      // 切换 agentsDigestLines 时仍能就地把自己的文件改成新形态，且不会把用户内容误判进来
      const ownedByText = isPluginOwnedText(current, rules.text) || isPluginDigestText(current)
      const owned = !exists || !current.trim() || ownedByState || ownedByText
      status.agentsFile.owned = owned
      status.agentsFile.ownedBy = !exists || !current.trim() ? 'absent' : ownedByState ? 'state-hash' : ownedByText ? 'text-match' : null
      status.agentsFile.digestLines = digestLines > 0 ? digestLines : null
      status.agentsFile.digestChars = digestLines > 0 ? channelText.length : null
      if (!owned) {
        status.agentsFile.reason = 'kept-user-content'
        status.agentsFile.userContentKept = true
        status.agentsFile.skippedAt = new Date().toISOString()
        status.agentsFile.error = null
        return
      }
      if (exists && current === expected) {
        if (!ownedByState) writeAgentsState(current)
        status.agentsFile.reason = 'unchanged'
        status.agentsFile.userContentKept = false
        status.agentsFile.syncedAt = new Date().toISOString()
        status.agentsFile.error = null
        return
      }
      const isCreate = !exists || !current.trim()
      status.agentsFile.reason = isCreate ? 'created' : 'upgraded'
      status.agentsFile.userContentKept = false
      status.agentsFile.backup = isCreate ? null : backupAgents(current)
      mkdirSync(home, { recursive: true })
      writeFileSync(agentsFile, expected, 'utf8')
      writeAgentsState(expected)
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
    try {
      pruneInstances()
    } catch {
      /* 清理失败不影响健康判定 */
    }
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
      const sectionNames = sections.map((s) => (s && s.name) || '(unnamed)')
      const recordNames = cfg.recordSectionNames === true
      status.lastSectionCount = sectionNames.length
      status.lastSectionNamesHash = shortHash(sectionNames.join('|'))
      status.lastSectionNames = recordNames ? sectionNames : null

      logLine({
        hook: ASSEMBLE_EVENT,
        sessionId: sid,
        fresh,
        isSubagent,
        action,
        rulesHash: rules.hash,
        rulesSource: rules.source,
        sectionCount: status.lastSectionCount,
        sectionNamesHash: status.lastSectionNamesHash,
        sectionNames: recordNames ? sectionNames : undefined,
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
