// clawd-trpg 의 세계 문서(world/*.md) 읽기: 구역(앵커) 찾기 · 찾아보기 · 지도 꺼내기 · 안개 걷기.
// 파일은 부르는 쪽이 읽어 넘긴다(여기는 순수 함수만). 형식은 world/format.md.

export type WorldFile = { id: string; path: string; text: string }
export type Section = { level: number; title: string; anchor: string; start: number; end: number }
export type WorldMap = { ref: string; lines: string[]; fog: boolean; rooms: Record<string, string>; glyphs: Record<string, string>; at: string }

const HEADING = /^(#{1,6})\s+(.*?)\s*$/
const ANCHOR = /\s*\{#([a-z0-9-]+)\}\s*$/
const MAX_TEXT = 14_000

/** ~~~~ 로 감싼 보기 글은 지운다(예시 안의 제목 · 지도를 진짜로 읽지 않게) */
function plainLines(text: string): string[] {
  let tilde = false
  let code = false
  return text.split('\n').map(line => {
    if (!tilde && line.startsWith('```')) code = !code
    if (!code && /^~~~~[a-z]*\s*$/.test(line)) {
      tilde = !tilde
      return ''
    }
    return tilde ? '' : line
  })
}

export function sectionsOf(lines: readonly string[]): Section[] {
  const heads: Omit<Section, 'end'>[] = []
  let code = false
  lines.forEach((line, i) => {
    if (line.startsWith('```')) {
      code = !code
      return
    }
    if (code) return
    const m = HEADING.exec(line)
    if (!m) return
    const raw = m[2] ?? ''
    const anchor = ANCHOR.exec(raw)?.[1] ?? ''
    heads.push({ level: (m[1] ?? '#').length, title: raw.replace(ANCHOR, '').trim(), anchor, start: i })
  })
  return heads.map((h, k) => {
    const next = heads.slice(k + 1).find(o => o.level <= h.level)
    return { ...h, end: next ? next.start : lines.length }
  })
}

export function fileTitle(f: WorldFile): string {
  return sectionsOf(plainLines(f.text))[0]?.title ?? f.id
}

/** "ashtower#f1" → 파일과 앵커. 파일만이면 anchor 는 '' */
export function parseRef(ref: string): { id: string; anchor: string } {
  const [id = '', anchor = ''] = ref.trim().replace(/^→\s*/, '').split('#')
  return { id: id.trim(), anchor: anchor.trim() }
}

function cut(text: string, more: string): string {
  return text.length <= MAX_TEXT ? text : `${text.slice(0, MAX_TEXT)}\n\n…(길어서 잘랐다. ${more})`
}

/** 세계 문서 목차 */
export function indexText(files: readonly WorldFile[]): string {
  const byDir = new Map<string, WorldFile[]>()
  for (const f of files) {
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '.'
    byDir.set(dir, [...(byDir.get(dir) ?? []), f])
  }
  const out = ['# 세계 문서 목차', 'lore(ref: "파일id") 로 한 파일의 개요와 목차를, lore(ref: "파일id#앵커") 로 한 구역을, lore(query: "낱말") 로 찾기.', '']
  for (const [dir, list] of [...byDir.entries()].sort()) {
    out.push(`## ${dir === '.' ? 'world/' : `world/${dir}/`}`)
    for (const f of [...list].sort((a, b) => a.id.localeCompare(b.id))) out.push(`- ${f.id} — ${fileTitle(f)}`)
  }
  return out.join('\n')
}

/** 한 파일: 맨 위 개요 + 목차, 또는 한 구역 */
export function loreText(files: readonly WorldFile[], ref: string): string {
  const { id, anchor } = parseRef(ref)
  const f = files.find(x => x.id === id)
  if (!f) return `세계 문서에 "${id}" 가 없다. 있는 것: ${files.map(x => x.id).sort().join(', ')}`
  const lines = plainLines(f.text)
  const raw = f.text.split('\n')
  const secs = sectionsOf(lines)
  if (!anchor || anchor === 'top') {
    const first = secs.find(s => s.level >= 2)
    const head = raw.slice(0, first ? first.start : raw.length).join('\n').trim()
    const toc = secs.filter(s => s.level >= 2 && s.level <= 3 && s.anchor).map(s => `${'  '.repeat(s.level - 2)}- ${s.title} → ${f.id}#${s.anchor}`)
    return cut(`${head}\n\n## 목차\n${toc.join('\n')}`, `구역마다 lore(ref: "${f.id}#앵커") 로 읽는다`)
  }
  const sec = secs.find(s => s.anchor === anchor)
  if (!sec) {
    const near = secs.filter(s => s.anchor && (s.anchor.includes(anchor) || anchor.includes(s.anchor))).map(s => `${f.id}#${s.anchor}`)
    return `${f.id} 에 #${anchor} 가 없다.${near.length ? ` 비슷한 것: ${near.slice(0, 8).join(', ')}` : ` lore(ref: "${f.id}") 로 목차를 본다.`}`
  }
  const subs = secs.filter(s => s.start > sec.start && s.start < sec.end && s.level === sec.level + 1 && s.anchor).map(s => `${f.id}#${s.anchor}`)
  return cut(raw.slice(sec.start, sec.end).join('\n').trim(), `하위 구역: ${subs.join(', ')}`)
}

/** 제목과 본문에서 낱말 찾기 → 구역 참조 */
export function searchText(files: readonly WorldFile[], query: string, limit = 20): string {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return 'query 가 비었다.'
  const hits: { ref: string; title: string; line: string; score: number }[] = []
  for (const f of files) {
    const lines = plainLines(f.text)
    const secs = sectionsOf(lines)
    for (const s of secs) {
      if (!s.anchor) continue
      // 이 구역 자신의 줄(하위 구역 앞까지)
      const own = secs.find(o => o.start > s.start && o.start < s.end)
      const body = lines.slice(s.start + 1, own ? own.start : s.end)
      const title = s.title.toLowerCase()
      const inTitle = words.every(w => title.includes(w))
      const line = body.find(l => words.every(w => l.toLowerCase().includes(w)))
      if (!inTitle && !line) continue
      hits.push({ ref: `${f.id}#${s.anchor}`, title: s.title, line: (line ?? '').trim().slice(0, 120), score: (inTitle ? 2 : 0) + (line ? 1 : 0) + (s.level <= 2 ? 0.5 : 0) })
    }
  }
  if (!hits.length) return `"${query}" 를 세계 문서에서 못 찾았다.`
  hits.sort((a, b) => b.score - a.score)
  return [`"${query}" 찾은 곳 ${hits.length}개${hits.length > limit ? ` 중 ${limit}개` : ''}:`, ...hits.slice(0, limit).map(h => `- ${h.ref} — ${h.title}${h.line ? ` · ${h.line}` : ''}`)].join('\n')
}

const ROOM = /^([0-9A-Z])\.\s*(.+)$/
const LEGEND = /^\s*[-*]?\s*\**`?([0-9A-Z])`?\**\s*[=:]\s*(.+?)\s*$/
/** 기호 범례: "`:` 장막 안 · `)` 장막의 막" 처럼 한 줄에 여럿, 또는 "- `~` = 마른 냇바닥" */
const GLYPH = /`([^`\s])`\s*[=:]?\s*([^·`\n|]+)/g

/** 지도 꺼내기: "ashtower#f1"(## 구역) 또는 "ashtower#f1-3"(그 방이 든 ## 구역의 지도, 일행은 그 방) */
export function mapOf(files: readonly WorldFile[], ref: string): WorldMap | string {
  const { id, anchor } = parseRef(ref)
  const f = files.find(x => x.id === id)
  if (!f) return `세계 문서에 "${id}" 가 없다.`
  const lines = plainLines(f.text)
  const secs = sectionsOf(lines)
  const hit = secs.find(s => s.anchor === anchor)
  if (!hit) return `${id} 에 #${anchor} 가 없다.`
  if (hit.level < 2) return `지도는 "##" 구역에 있다: lore(ref: "${id}") 로 목차를 본다.`
  // 방을 가리키면 그 방을 품은 ## 구역
  const owner = hit.level === 2 ? hit : [...secs].reverse().find(s => s.level === 2 && s.start < hit.start && hit.start < s.end)
  if (!owner) return `${ref} 를 품은 "##" 구역이 없다.`
  let open = -1
  let fog = true
  for (let i = owner.start; i < owner.end; i++) {
    const t = (lines[i] ?? '').trim()
    if (t === '```map' || t === '```map nofog') {
      open = i
      fog = t === '```map'
      break
    }
  }
  if (open < 0) return `${id}#${owner.anchor} 에 지도(\`\`\`map)가 없다.`
  let close = open + 1
  while (close < owner.end && (lines[close] ?? '').trim() !== '```') close++
  const grid = lines.slice(open + 1, close).map(l => l.replace(/\s+$/, ''))
  const rooms: Record<string, string> = {}
  for (const s of secs) {
    if (s.level !== 3 || s.start <= owner.start || s.start >= owner.end) continue
    const m = ROOM.exec(s.title)
    if (m?.[1] && m[2]) rooms[m[1]] = m[2]
  }
  // 펼친 지도는 범례 줄(A = 버들목)에서 이름을
  for (let i = close + 1; i < owner.end; i++) {
    const m = LEGEND.exec(lines[i] ?? '')
    if (m?.[1] && m[2] && !rooms[m[1]]) rooms[m[1]] = m[2].replace(/\(?→.*$/, '').replace(/[`*]/g, '').trim()
  }
  // 기호 범례(장소 글자 말고): 지형 · 표식의 뜻으로 그림판이 색을 고른다
  const glyphs: Record<string, string> = {}
  for (let i = close + 1; i < owner.end; i++) {
    const line = lines[i] ?? ''
    if (!line.includes('`')) continue
    for (const m of line.matchAll(GLYPH)) {
      const g = m[1] ?? ''
      const name = (m[2] ?? '').replace(/\(?→.*$/, '').replace(/[*]/g, '').trim()
      if (g && name && !/^[0-9A-Z]$/.test(g) && !glyphs[g]) glyphs[g] = name
    }
  }
  const at = hit.level === 3 ? ROOM.exec(hit.title)?.[1] ?? '' : ''
  return { ref: `${id}#${owner.anchor}`, lines: grid, fog, rooms, glyphs, at }
}

// ── 안개 ─────────────────────────────────────────────────────────────

const BLOCK = new Set(['#', '+', '%', ' '])
const isLabel = (c: string) => /^[0-9A-Za-z]$/.test(c)

/** 걸을 수 있는 칸 덩어리마다 번호, 덩어리의 표지 */
function regions(grid: readonly string[]): { id: number[][]; label: Map<number, string> } {
  const h = grid.length
  const w = Math.max(0, ...grid.map(r => r.length))
  const id = Array.from({ length: h }, () => Array<number>(w).fill(-1))
  const label = new Map<number, string>()
  let next = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (BLOCK.has(grid[y]?.[x] ?? ' ') || id[y]![x]! >= 0) continue
      const queue: [number, number][] = [[y, x]]
      id[y]![x] = next
      while (queue.length) {
        const [cy, cx] = queue.shift()!
        const c = grid[cy]?.[cx] ?? ' '
        if (isLabel(c) && !label.has(next)) label.set(next, c)
        for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const ny = cy + dy
          const nx = cx + dx
          if (ny < 0 || nx < 0 || ny >= h || nx >= w) continue
          if (BLOCK.has(grid[ny]?.[nx] ?? ' ') || id[ny]![nx]! >= 0) continue
          id[ny]![nx] = next
          queue.push([ny, nx])
        }
      }
      next += 1
    }
  }
  return { id, label }
}

/** 지도의 표지들(방 · 통로) */
export function labelsOf(grid: readonly string[]): string[] {
  return [...new Set(grid.join('').split('').filter(isLabel))]
}

/** 드러낸 표지의 구역만 그리고, 일행 자리에 @. 펼친 지도는 그대로(일행만) */
export function renderMap(grid: readonly string[], fog: boolean, revealed: readonly string[], at: string): string[] {
  if (!fog) {
    let placed = false
    return grid.map(row => {
      if (placed || !at || !row.includes(at)) return row
      placed = true
      const i = row.indexOf(at)
      return `${row.slice(0, i)}@${row.slice(i + 1)}`
    })
  }
  const shown = new Set([...revealed, ...(at ? [at] : [])])
  const { id, label } = regions(grid)
  const open = new Set([...label.entries()].filter(([, l]) => shown.has(l)).map(([n]) => n))
  const h = grid.length
  const w = Math.max(0, ...grid.map(r => r.length))
  const inOpen = (y: number, x: number) => y >= 0 && x >= 0 && y < h && x < w && open.has(id[y]![x]!)
  const out: string[] = []
  for (let y = 0; y < h; y++) {
    let row = ''
    for (let x = 0; x < w; x++) {
      const c = grid[y]?.[x] ?? ' '
      if (inOpen(y, x)) {
        row += isLabel(c) ? (c === at ? '@' : /[a-z]/.test(c) ? '.' : c) : c
        continue
      }
      if (c === ' ') {
        row += ' '
        continue
      }
      let near = false
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) if ((dy || dx) && inOpen(y + dy, x + dx)) near = true
      if (!near) {
        row += ' '
        continue
      }
      if (c === '%') {
        // 숨은 문은 양쪽을 다 알아야 문으로 보인다
        const sides = new Set([[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dy, dx]) => inOpen(y + dy!, x + dx!)).map(([dy, dx]) => id[y + dy!]![x + dx!]))
        row += sides.size >= 2 ? '+' : '#'
        continue
      }
      row += c
    }
    out.push(row.replace(/\s+$/, ''))
  }
  // 위아래 빈 줄은 덜어 낸다
  while (out.length && !out[0]) out.shift()
  while (out.length && !out[out.length - 1]) out.pop()
  return out
}
