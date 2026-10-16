// clawd-trpg 의 규칙: 2d6 판정 · 주사위 식 · 캠페인 고치기 · 글로 옮기기.
// 화면도 파일도 모르는 순수 함수만 둔다(테스트가 그대로 부른다).

import type { Ask, Campaign, Character, Clock, DiceGroup, Fact, Foe, GameTime, Item, LogKind, Person, Quest, QuestStatus, Roll, SaveInfo, Scene, Stat, Stats, StoryLine, Tier } from '../types'
import { labelsOf } from './world'

export const STATS: readonly Stat[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
export const STAT_LABEL: Record<Stat, string> = { str: '힘', dex: '민첩', con: '체력', int: '지능', wis: '지혜', cha: '매력' }
export const TIER_LABEL: Record<Tier, string> = { strong: '강한 성공', weak: '약한 성공', miss: '실패' }
export const TIME_PARTS = ['새벽', '아침', '낮', '해 질 녘', '밤'] as const
const TIER_HINT: Record<Tier, string> = {
  strong: '원하는 대로 된다',
  weak: '되긴 하지만 대가·어려운 선택이 따른다',
  miss: 'GM 이 수를 둔다: 위험이 닥친다',
}
const KEEP_ROLLS = 40
const KEEP_LOG = 200
const MAX_DICE = 30

/** [0, 1) 사이 수 */
export type Rng = () => number

export function cryptoRng(): number {
  const one = new Uint32Array(1)
  crypto.getRandomValues(one)
  return (one[0] ?? 0) / 4_294_967_296
}

export type Outcome = { game: Campaign; text: string; roll?: Roll } | { error: string }

// ── 작은 도우미 ──────────────────────────────────────────────────────

export function signed(n: number): string {
  return n >= 0 ? `+${n}` : String(n)
}

function int(value: unknown): number | undefined {
  const n = typeof value === 'string' ? (value.trim() ? Number(value.trim()) : NaN) : value
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : undefined
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined
}

function strings(value: unknown): string[] | undefined {
  if (typeof value === 'string') return value.split(/[,\n]/).map(s => s.trim()).filter(Boolean)
  return Array.isArray(value) ? value.map(v => (typeof v === 'string' ? v.trim() : '')).filter(Boolean) : undefined
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/** 터미널 칸 수(한글·전각은 2칸) */
export function cells(s: string): number {
  let n = 0
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    n += (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x1f300 && c <= 0x1faff) ? 2 : 1
  }
  return n
}

/** 칸 수에 맞춰 자르고 채운다 */
export function pad(s: string, width: number): string {
  if (width <= 0) return ''
  if (cells(s) <= width) return s + ' '.repeat(width - cells(s))
  let out = ''
  for (const ch of s) {
    if (cells(out + ch) > width - 1) break
    out += ch
  }
  return out + '…' + ' '.repeat(Math.max(0, width - 1 - cells(out)))
}

/** ████░░ 꼴 막대 */
export function bar(value: number, max: number, width: number): string {
  const full = max > 0 ? clamp(Math.round((value / max) * width), 0, width) : 0
  return '█'.repeat(full) + '░'.repeat(width - full)
}

export function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return '방금'
  if (s < 3600) return `${Math.floor(s / 60)}분 전`
  if (s < 86_400) return `${Math.floor(s / 3600)}시간 전`
  return `${Math.floor(s / 86_400)}일 전`
}

export function toStat(value: unknown): Stat | undefined {
  const v = text(value)?.toLowerCase()
  if (!v) return undefined
  return STATS.find(s => s === v || STAT_LABEL[s] === v)
}

export function xpNeeded(c: Character): number {
  return c.level + 7
}

// ── 주사위 ───────────────────────────────────────────────────────────

export function die(sides: number, rng: Rng): number {
  return 1 + Math.min(sides - 1, Math.floor(rng() * sides))
}

/** "2d6+1" · "d8 + d4 - 1" · "d100" → 묶음과 더할 수. 틀리면 까닭을 글로 */
export function parseDice(expr: string): { dice: { count: number; sides: number }[]; mod: number } | string {
  const flat = expr.replace(/\s+/g, '').toLowerCase().replace(/[ｄ주]/g, 'd')
  if (!flat) return '주사위 식이 비었다'
  const tokens = flat.match(/[+-]?[^+-]+/g) ?? []
  if (tokens.join('') !== flat) return `주사위 식을 못 읽었다: ${expr}`
  const dice: { count: number; sides: number }[] = []
  let mod = 0
  for (const token of tokens) {
    const sign = token.startsWith('-') ? -1 : 1
    const body = token.replace(/^[+-]/, '')
    const d = /^(\d*)d(\d+)$/.exec(body)
    if (d) {
      if (sign < 0) return `주사위를 빼는 식은 안 된다: ${expr}`
      const count = d[1] ? Number(d[1]) : 1
      const sides = Number(d[2])
      if (count < 1 || sides < 2 || sides > 100) return `주사위는 1개 이상, 2~100면이어야 한다: ${token}`
      dice.push({ count, sides })
    } else if (/^\d+$/.test(body)) {
      mod += sign * Number(body)
    } else {
      return `주사위 식을 못 읽었다: ${token}`
    }
  }
  if (!dice.length) return `굴릴 주사위가 없다: ${expr}`
  if (dice.reduce((n, d) => n + d.count, 0) > MAX_DICE) return `주사위는 한 번에 ${MAX_DICE}개까지다`
  return { dice, mod }
}

export function rollDice(expr: string, rng: Rng): { groups: DiceGroup[]; mod: number; total: number; expr: string } | string {
  const parsed = parseDice(expr)
  if (typeof parsed === 'string') return parsed
  const groups = parsed.dice.map(d => ({ sides: d.sides, values: Array.from({ length: d.count }, () => die(d.sides, rng)) }))
  const total = groups.reduce((n, g) => n + g.values.reduce((a, b) => a + b, 0), 0) + parsed.mod
  const shown = parsed.dice.map(d => `${d.count > 1 ? d.count : ''}d${d.sides}`).join('+') + (parsed.mod ? signed(parsed.mod) : '')
  return { groups, mod: parsed.mod, total, expr: shown }
}

export function tierOf(total: number): Tier {
  return total >= 10 ? 'strong' : total >= 7 ? 'weak' : 'miss'
}

/** [3,5] · d8[6] 꼴로 */
export function diceText(groups: readonly DiceGroup[]): string {
  return groups.map(g => (g.sides === 6 && groups.length === 1 ? '' : `d${g.sides}`) + `[${g.values.join(',')}]`).join(' ')
}

export function rollLine(r: Roll): string {
  const head = `${r.who ? `${r.who} · ` : ''}${r.what}`
  const mod = r.mod ? ` ${signed(r.mod)}` : ''
  const tail = r.tier ? ` → ${TIER_LABEL[r.tier]}` : ''
  const hit = r.target ? ` → ${r.target} HP -${r.dealt ?? 0}` : ''
  return `${head}: ${r.expr} ${diceText(r.groups)}${mod} = ${r.total}${tail}${hit}`
}

// ── 캠페인 ───────────────────────────────────────────────────────────

export function slugOf(name: string): string {
  const s = name.trim().replace(/[/\\:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, '-').replace(/^\.+/, '').slice(0, 60)
  return s || 'campaign'
}

export function newCampaign(name: string, premise: string, now: number): Campaign {
  return {
    version: 1,
    name: name.trim() || '이름 없는 모험',
    slug: slugOf(name),
    premise: premise.trim(),
    createdAt: now,
    updatedAt: now,
    party: [],
    scene: blankScene(),
    quests: [],
    rolls: [],
    log: [{ at: now, text: `모험 「${name.trim() || '이름 없는 모험'}」 시작`, kind: 'system' }],
    secrets: [],
    choices: [],
    ask: null,
    nextRollId: 1,
    clocks: [],
    time: { day: 1, part: 1 },
    story: [],
    people: [],
    facts: [],
  }
}

const KEEP_STORY = 80

/** 이야기 탭에 한 덩이 더하기 */
export function addStory(g: Campaign, who: StoryLine['who'], text: string, now: number): Campaign {
  const t = text.trim()
  return t ? { ...g, story: [...g.story, { at: now, who, text: t }].slice(-KEEP_STORY) } : g
}

export function blankScene(): Scene {
  return { title: '', text: '', map: [], foes: [], mapRef: '', fog: false, revealed: [], at: '', rooms: {}, glyphs: {} }
}

export function timeText(t: GameTime): string {
  return `${t.day}일째 ${TIME_PARTS[t.part] ?? ''}`
}

export function clockText(c: Clock): string {
  return `${c.name} ${'●'.repeat(c.filled)}${'○'.repeat(Math.max(0, c.size - c.filled))} ${c.filled}/${c.size}${c.visible ? '' : '(비공개)'}${c.note ? ` — ${c.note}` : ''}`
}

function blankStats(): Stats {
  return { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }
}

function blankCharacter(name: string, isPlayer: boolean): Character {
  return { name, role: '모험가', isPlayer, level: 1, xp: 0, hp: 10, maxHp: 10, armor: 0, damage: 'd6', stats: blankStats(), items: [], gold: 0, conditions: [], moves: [], look: '', forward: 0 }
}

/** "횃불×3" · "횃불 x3" · { name, qty } */
export function toItem(value: unknown): Item | undefined {
  if (typeof value === 'string') {
    const m = /^(.*?)\s*[x×*]\s*(\d+)$/i.exec(value.trim())
    const name = (m ? m[1] ?? '' : value).trim()
    return name ? { name, qty: m ? Number(m[2]) : 1 } : undefined
  }
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    const name = text(o.name)
    if (!name) return undefined
    const note = text(o.note)
    return { name, qty: Math.max(1, int(o.qty) ?? 1), ...(note ? { note } : {}) }
  }
  return undefined
}

function items(value: unknown): Item[] | undefined {
  if (typeof value === 'string') return strings(value)?.map(toItem).filter((i): i is Item => !!i)
  return Array.isArray(value) ? value.map(toItem).filter((i): i is Item => !!i) : undefined
}

function toStats(value: unknown, base: Stats): Stats {
  if (!value || typeof value !== 'object') return base
  const out = { ...base }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const stat = toStat(k)
    const n = int(v)
    if (stat && n !== undefined) out[stat] = clamp(n, -3, 4)
  }
  return out
}

export function findMember(g: Campaign, who?: string): Character | undefined {
  const name = (who ?? '').trim().toLowerCase()
  if (!name || ['주인님', 'player', 'pc', '플레이어'].includes(name)) return g.party.find(c => c.isPlayer) ?? g.party[0]
  return g.party.find(c => c.name.toLowerCase() === name) ?? g.party.find(c => c.name.toLowerCase().startsWith(name))
}

export function findFoe(g: Campaign, name?: string): Foe | undefined {
  const n = (name ?? '').trim().toLowerCase()
  if (!n) return undefined
  return g.scene.foes.find(f => f.name.toLowerCase() === n) ?? g.scene.foes.find(f => f.name.toLowerCase().startsWith(n))
}

function withMember(g: Campaign, name: string, fn: (c: Character) => Character): Campaign {
  return { ...g, party: g.party.map(c => (c.name === name ? fn(c) : c)) }
}

function withFoe(g: Campaign, name: string, fn: (f: Foe) => Foe): Campaign {
  return { ...g, scene: { ...g.scene, foes: g.scene.foes.map(f => (f.name === name ? fn(f) : f)) } }
}

function logged(g: Campaign, now: number, line: string, kind: LogKind): Campaign {
  return { ...g, log: [...g.log, { at: now, text: line, kind }].slice(-KEEP_LOG) }
}

function addRoll(g: Campaign, roll: Roll): Campaign {
  return { ...g, rolls: [...g.rolls, roll].slice(-KEEP_ROLLS), nextRollId: roll.id + 1 }
}

function addItems(list: readonly Item[], more: readonly Item[]): Item[] {
  const out = list.map(i => ({ ...i }))
  for (const m of more) {
    const same = out.find(i => i.name === m.name)
    if (same) same.qty += m.qty
    else out.push({ ...m })
  }
  return out
}

/** 뺄 것: "횃불×1" · { name, qty } 은 그만큼, 이름만이면 모두 */
type Removal = { name: string; qty: number | 'all' }

function toRemovals(value: unknown): Removal[] {
  const list = typeof value === 'string' ? strings(value) ?? [] : Array.isArray(value) ? value : []
  return list.flatMap((v): Removal[] => {
    const item = toItem(v)
    if (!item) return []
    const counted = typeof v === 'string' ? /[x×*]\s*\d+$/i.test(v.trim()) : int(obj(v).qty) !== undefined
    return [{ name: item.name, qty: counted ? item.qty : 'all' }]
  })
}

function removeItems(list: readonly Item[], less: readonly Removal[]): { items: Item[]; gone: string[]; missing: string[] } {
  let out = list.map(i => ({ ...i }))
  const gone: string[] = []
  const missing: string[] = []
  for (const l of less) {
    const same = out.find(i => i.name === l.name) ?? out.find(i => i.name.startsWith(l.name))
    if (!same) {
      missing.push(l.name)
      continue
    }
    const qty = l.qty === 'all' ? same.qty : Math.min(same.qty, l.qty)
    same.qty -= qty
    gone.push(itemText({ name: same.name, qty }))
    out = out.filter(i => i.qty > 0)
  }
  return { items: out, gone, missing }
}

function hpNote(c: { name: string; hp: number; maxHp: number }, before: number, isFoe: boolean): string {
  const line = `${c.name} HP ${before} → ${c.hp}/${c.maxHp}`
  if (c.hp > 0) return line
  return isFoe ? `${line} (쓰러졌다)` : `${line} (HP 0: "마지막 숨" 판정 — 보정 없는 2d6 — 을 해야 한다)`
}

// ── 행동별로 고치기 ──────────────────────────────────────────────────

function character(g: Campaign, input: Record<string, unknown>, now: number): Outcome {
  const name = text(input.name)
  if (!name) return { error: 'character 에는 name 이 필요하다' }
  const held = g.party.find(c => c.name === name)
  if (input.remove === true) {
    if (!held) return { error: `${name} 은(는) 파티에 없다` }
    return { game: logged({ ...g, party: g.party.filter(c => c.name !== name) }, now, `${name} 이(가) 파티를 떠났다`, 'system'), text: `${name} 을(를) 파티에서 뺐다.` }
  }
  const isPlayer = typeof input.isPlayer === 'boolean' ? input.isPlayer : held?.isPlayer ?? !g.party.some(c => c.isPlayer)
  const base = held ?? blankCharacter(name, isPlayer)
  const maxHp = Math.max(1, int(input.maxHp) ?? base.maxHp)
  const next: Character = {
    ...base,
    isPlayer,
    role: text(input.role) || base.role,
    level: Math.max(1, int(input.level) ?? base.level),
    xp: Math.max(0, int(input.xp) ?? base.xp),
    maxHp,
    hp: clamp(int(input.hp) ?? (held ? base.hp : maxHp), 0, maxHp),
    armor: Math.max(0, int(input.armor) ?? base.armor),
    damage: text(input.damage) || base.damage,
    stats: toStats(input.stats, base.stats),
    items: items(input.items) ?? base.items,
    gold: Math.max(0, int(input.gold) ?? base.gold),
    conditions: strings(input.conditions) ?? base.conditions,
    moves: strings(input.moves) ?? base.moves,
    look: text(input.look) ?? base.look,
    forward: int(input.forward) ?? base.forward,
  }
  if (next.damage !== base.damage && typeof parseDice(next.damage) === 'string') return { error: `피해 주사위를 못 읽었다: ${next.damage}` }
  // 주인님 캐릭터는 한 명
  const party = held ? g.party.map(c => (c.name === name ? next : c)) : [...g.party, next]
  const fixed = isPlayer ? party.map(c => (c.name === name ? c : { ...c, isPlayer: false })) : party
  const game = held ? { ...g, party: fixed } : logged({ ...g, party: fixed }, now, `${name}(${next.role}) 합류`, 'system')
  return { game, text: `${held ? '고쳤다' : '파티에 넣었다'}: ${sheetLine(next)}` }
}

function change(g: Campaign, input: Record<string, unknown>, now: number): Outcome {
  const who = text(input.who)
  const member = findMember(g, who)
  const hp = int(input.hp)
  if (!member) {
    const foe = findFoe(g, who)
    if (!foe) return { error: `${who ?? '(이름 없음)'} 을(를) 파티에도 장면의 적에도 못 찾았다` }
    if (hp === undefined) return { error: '적은 hp 만 바꿀 수 있다(foe 로 다른 값을 고친다)' }
    const after = clamp(foe.hp + hp, 0, foe.maxHp)
    const game = withFoe(g, foe.name, f => ({ ...f, hp: after }))
    const note = hpNote({ ...foe, hp: after }, foe.hp, true)
    return { game: logged(game, now, note, 'hp'), text: note }
  }
  const notes: string[] = []
  let c = { ...member }
  if (hp !== undefined) {
    const before = c.hp
    c = { ...c, hp: clamp(c.hp + hp, 0, c.maxHp) }
    notes.push(hpNote(c, before, false))
  }
  const xp = int(input.xp)
  if (xp) {
    c = { ...c, xp: Math.max(0, c.xp + xp) }
    notes.push(`XP ${signed(xp)} → ${c.xp}/${xpNeeded(c)}${c.xp >= xpNeeded(c) ? ' (레벨 업 가능: 쉴 때 올린다)' : ''}`)
  }
  const gold = int(input.gold)
  if (gold) {
    c = { ...c, gold: Math.max(0, c.gold + gold) }
    notes.push(`금화 ${signed(gold)} → ${c.gold}`)
  }
  const forward = int(input.forward)
  if (forward) {
    c = { ...c, forward: c.forward + forward }
    notes.push(`다음 굴림 ${signed(c.forward)}`)
  }
  const gained = items(input.addItems)
  if (gained?.length) {
    c = { ...c, items: addItems(c.items, gained) }
    notes.push(`얻음: ${gained.map(itemText).join(', ')}`)
  }
  const lost = toRemovals(input.removeItems)
  if (lost.length) {
    const r = removeItems(c.items, lost)
    c = { ...c, items: r.items }
    if (r.gone.length) notes.push(`잃음: ${r.gone.join(', ')}`)
    if (r.missing.length) notes.push(`가방에 없음: ${r.missing.join(', ')}`)
  }
  const on = strings(input.addConditions)
  if (on?.length) {
    c = { ...c, conditions: [...c.conditions, ...on.filter(x => !c.conditions.includes(x))] }
    notes.push(`상태 +${on.join(', ')}`)
  }
  const off = strings(input.removeConditions)
  if (off?.length) {
    c = { ...c, conditions: c.conditions.filter(x => !off.includes(x)) }
    notes.push(`상태 -${off.join(', ')}`)
  }
  if (!notes.length) return { error: 'change 에 바꿀 값이 없다(hp · xp · gold · forward · addItems · removeItems · addConditions · removeConditions)' }
  const line = `${c.name}: ${notes.join(' · ')}`
  const kind: LogKind = hp !== undefined ? 'hp' : gained?.length || gold ? 'loot' : 'system'
  return { game: logged(withMember(g, c.name, () => c), now, line, kind), text: line }
}

function moveRoll(g: Campaign, input: Record<string, unknown>, now: number, rng: Rng, by: 'player' | 'gm'): Outcome {
  // 인자 없이(또는 같은 기술로) 부르면 대기 중인 굴림 요청대로 굴린다
  const asked = g.ask && (!text(input.move) || text(input.move) === g.ask.move) ? g.ask : null
  const move = text(input.move) || asked?.move || '판정'
  const hasStat = input.stat !== undefined && input.stat !== null && input.stat !== ''
  const stat = hasStat ? toStat(input.stat) : asked?.stat
  if (hasStat && !stat) return { error: `능력치를 못 읽었다: ${String(input.stat)} (str·dex·con·int·wis·cha 또는 힘·민첩·체력·지능·지혜·매력)` }
  const bonus = int(input.bonus) ?? asked?.bonus ?? 0
  const who = text(input.who) || asked?.who || ''
  const member = findMember(g, who)
  if (who && !member) return { error: `${who} 은(는) 파티에 없다` }
  const statMod = member && stat ? member.stats[stat] : 0
  const forward = member?.forward ?? 0
  const values = [die(6, rng), die(6, rng)]
  const mod = statMod + bonus + forward
  const total = values[0]! + values[1]! + mod
  const tier = tierOf(total)
  const parts = [stat ? `${STAT_LABEL[stat]}${signed(statMod)}` : '', bonus ? `보정${signed(bonus)}` : '', forward ? `다음 굴림${signed(forward)}` : ''].filter(Boolean)
  const roll: Roll = {
    id: g.nextRollId, at: now, who: member?.name ?? who, what: move, expr: `2d6${parts.length ? `+${parts.join('+')}` : ''}`,
    groups: [{ sides: 6, values }], mod, total, tier, by, ...(stat ? { stat } : {}),
  }
  let game = addRoll({ ...g, ask: null, choices: [] }, roll)
  const notes = [`${rollLine(roll)} (${TIER_HINT[tier]})`]
  if (member && forward) game = withMember(game, member.name, c => ({ ...c, forward: 0 }))
  if (member?.isPlayer && tier === 'miss') {
    game = withMember(game, member.name, c => ({ ...c, xp: c.xp + 1 }))
    const after = findMember(game, member.name)
    if (after) notes.push(`실패라서 ${after.name} XP +1 → ${after.xp}/${xpNeeded(after)}`)
  }
  game = logged(game, now, rollLine(roll), 'roll')
  return { game, text: notes.join('\n'), roll }
}

function dice(g: Campaign, input: Record<string, unknown>, now: number, rng: Rng): Outcome {
  const expr = text(input.expr)
  if (!expr) return { error: 'dice 에는 expr(예: "d8+1", "2d6", "d100")이 필요하다' }
  const r = rollDice(expr, rng)
  if (typeof r === 'string') return { error: r }
  const who = text(input.who) ?? ''
  const roll: Roll = { id: g.nextRollId, at: now, who, what: text(input.why) || '굴림', expr: r.expr, groups: r.groups, mod: r.mod, total: r.total, by: 'gm' }
  const target = text(input.target)
  let game = g
  let hit = ''
  if (target) {
    const foe = findFoe(g, target)
    const member = foe ? undefined : findMember(g, target)
    if (!foe && !member) return { error: `${target} 을(를) 장면의 적에도 파티에도 못 찾았다` }
    const armor = input.ignoreArmor === true ? 0 : (foe ?? member)!.armor
    const dealt = Math.max(0, r.total - armor)
    roll.target = (foe ?? member)!.name
    roll.dealt = dealt
    if (foe) {
      const after = clamp(foe.hp - dealt, 0, foe.maxHp)
      game = withFoe(game, foe.name, f => ({ ...f, hp: after }))
      hit = hpNote({ ...foe, hp: after }, foe.hp, true)
    } else if (member) {
      const after = clamp(member.hp - dealt, 0, member.maxHp)
      game = withMember(game, member.name, c => ({ ...c, hp: after }))
      hit = hpNote({ ...member, hp: after }, member.hp, false)
    }
    if (armor && dealt < r.total) hit += ` (방어 ${armor} 막음)`
  }
  game = logged(addRoll(game, roll), now, rollLine(roll), 'roll')
  return { game, text: [rollLine(roll), hit].filter(Boolean).join('\n'), roll }
}

function asking(g: Campaign, input: Record<string, unknown>): Outcome {
  const move = text(input.move)
  if (!move) return { error: 'ask 에는 move(기술 이름)가 필요하다' }
  const stat = input.stat === undefined || input.stat === null || input.stat === '' ? undefined : toStat(input.stat)
  if (input.stat !== undefined && input.stat !== null && input.stat !== '' && !stat) return { error: `능력치를 못 읽었다: ${String(input.stat)}` }
  const member = findMember(g, text(input.who))
  if (!member) return { error: '굴릴 캐릭터가 없다. 먼저 character 로 주인님 캐릭터를 만든다' }
  const ask: Ask = { move, bonus: int(input.bonus) ?? 0, who: member.name, why: text(input.why) ?? '', ...(stat ? { stat } : {}) }
  const mod = (stat ? member.stats[stat] : 0) + ask.bonus + member.forward
  return {
    game: { ...g, ask, choices: [] },
    text: `패널에 굴리기 버튼을 띄웠다: ${member.name} · ${move}${stat ? `(${STAT_LABEL[stat]})` : ''} 2d6${mod ? signed(mod) : ''}. 주인님이 버튼을 누르면 결과가 다음 말로 온다(주인님이 "굴려" 라고만 하면 roll 을 인자 없이 부른다). 이번 응답은 여기서 끝낸다.`,
  }
}

/** 세계 문서에서 꺼낸 지도(register 가 읽어 input.world 로 넘긴다) */
type WorldMapInput = { ref: string; lines: string[]; fog: boolean; rooms: Record<string, string>; glyphs?: Record<string, string>; at: string }

function scene(g: Campaign, input: Record<string, unknown>, now: number): Outcome {
  const title = text(input.title)
  const body = text(input.text)
  const world = input.world && typeof input.world === 'object' ? (input.world as WorldMapInput) : undefined
  // 지도는 칸을 맞춘 그림이라 다듬지 않는다
  const drawn = world ? undefined : (typeof input.map === 'string' ? input.map.replace(/\s+$/, '').split('\n') : Array.isArray(input.map) ? input.map.map(String) : undefined)?.slice(0, 20)
  const foes = Array.isArray(input.foes) ? input.foes.map(f => toFoe(f)).filter((f): f is Foe => !!f) : undefined
  const reveal = strings(input.reveal)
  const at = text(input.at)
  if (title === undefined && body === undefined && !world && drawn === undefined && foes === undefined && !reveal?.length && at === undefined) {
    return { error: 'scene 에 바꿀 값이 없다(title · text · map · foes · reveal · at)' }
  }
  const isNew = title !== undefined && title !== g.scene.title
  const base: Scene = isNew ? { ...blankScene(), title: title ?? '' } : g.scene
  let next: Scene = { ...base, title: title ?? base.title, text: body ?? base.text, foes: foes ?? base.foes }
  if (world) next = { ...next, map: world.lines, mapRef: world.ref, fog: world.fog, rooms: world.rooms, glyphs: world.glyphs ?? {}, revealed: [], at: world.at }
  else if (drawn) next = { ...next, map: drawn, mapRef: '', fog: false, rooms: {}, glyphs: {}, revealed: [], at: '' }
  if (at !== undefined) next = { ...next, at }
  const opened = [...(reveal ?? []), ...(next.at ? [next.at] : [])]
  if (next.fog && opened.length) {
    const known = labelsOf(next.map)
    const unknown = opened.filter(l => !known.includes(l))
    if (unknown.length) return { error: `지도(${next.mapRef})에 없는 표지: ${unknown.join(', ')}. 있는 표지: ${known.join(' ')}` }
  }
  next = { ...next, revealed: [...new Set([...next.revealed, ...opened])] }
  const game = { ...g, scene: next }
  const where = next.at ? ` · 일행 @ ${next.at}${next.rooms[next.at] ? ` ${next.rooms[next.at]}` : ''}` : ''
  const mapNote = next.mapRef ? ` · 지도 ${next.mapRef}${next.fog ? `(드러난 곳 ${next.revealed.join(' ') || '없음'})` : ''}` : ''
  return {
    game: isNew ? logged(game, now, `장면: ${next.title}`, 'story') : game,
    text: `장면을 ${isNew ? '바꿨다' : '고쳤다'}: ${next.title}${where}${mapNote}${next.foes.length ? ` · 적 ${next.foes.map(foeText).join(', ')}` : ''}`,
  }
}

function clock(g: Campaign, input: Record<string, unknown>): Outcome {
  const name = text(input.name)
  if (!name) return { error: 'clock 에는 name 이 필요하다' }
  const held = g.clocks.find(c => c.name === name) ?? g.clocks.find(c => c.name.startsWith(name))
  if (input.remove === true) {
    if (!held) return { error: `시계 ${name} 가 없다` }
    return { game: { ...g, clocks: g.clocks.filter(c => c !== held) }, text: `시계를 치웠다: ${held.name}` }
  }
  const size = clamp(int(input.size) ?? held?.size ?? 6, 2, 12)
  const set = int(input.set)
  const tick = int(input.tick) ?? 0
  const filled = clamp((set ?? held?.filled ?? 0) + tick, 0, size)
  const next: Clock = {
    name: held?.name ?? name,
    size,
    filled,
    visible: typeof input.visible === 'boolean' ? input.visible : held?.visible ?? true,
    note: text(input.note) ?? held?.note ?? '',
  }
  const clocks = held ? g.clocks.map(c => (c === held ? next : c)) : [...g.clocks, next]
  const full = filled >= size && (held?.filled ?? 0) < size
  return { game: { ...g, clocks }, text: `${held ? '시계' : '새 시계'}: ${clockText(next)}${full ? ' — 다 찼다! 약속된 일이 일어난다' : ''}` }
}

function passTime(g: Campaign, input: Record<string, unknown>, now: number): Outcome {
  const before = g.time
  const day = int(input.day)
  const partName = text(input.part)
  const part = partName === undefined ? undefined : (TIME_PARTS as readonly string[]).indexOf(partName) >= 0 ? (TIME_PARTS as readonly string[]).indexOf(partName) : int(partName)
  if (partName !== undefined && (part === undefined || part < 0 || part > 4)) return { error: `때를 못 읽었다: ${partName} (${TIME_PARTS.join(' · ')})` }
  const advance = int(input.advance) ?? 0
  if (day === undefined && part === undefined && !advance) return { error: 'time 에는 advance(몇 때 흐르나) 또는 day · part 가 필요하다' }
  const start = (Math.max(1, day ?? before.day) - 1) * 5 + (part ?? before.part)
  const total = Math.max(0, start + advance)
  const after: GameTime = { day: Math.floor(total / 5) + 1, part: total % 5 }
  const days = after.day - before.day
  const game = logged({ ...g, time: after }, now, `시간: ${timeText(after)}`, 'system')
  return { game, text: `${timeText(before)} → ${timeText(after)}${days > 0 ? ` (하루가 ${days}번 지났다: 하루 단위 시계를 확인한다)` : ''}` }
}

function toFoe(value: unknown, base?: Foe): Foe | undefined {
  if (!value || typeof value !== 'object') return undefined
  const o = value as Record<string, unknown>
  const name = text(o.name) || base?.name
  if (!name) return undefined
  const maxHp = Math.max(1, int(o.maxHp) ?? base?.maxHp ?? int(o.hp) ?? 6)
  return {
    name,
    maxHp,
    hp: clamp(int(o.hp) ?? base?.hp ?? maxHp, 0, maxHp),
    armor: Math.max(0, int(o.armor) ?? base?.armor ?? 0),
    damage: text(o.damage) || base?.damage || 'd6',
    note: text(o.note) ?? base?.note ?? '',
  }
}

function foe(g: Campaign, input: Record<string, unknown>, now: number): Outcome {
  const name = text(input.name)
  if (!name) return { error: 'foe 에는 name 이 필요하다' }
  const held = findFoe(g, name)
  if (input.remove === true) {
    if (!held) return { error: `${name} 은(는) 장면에 없다` }
    return { game: { ...g, scene: { ...g.scene, foes: g.scene.foes.filter(f => f.name !== held.name) } }, text: `${held.name} 을(를) 장면에서 뺐다.` }
  }
  const next = toFoe({ ...input, name: held?.name ?? name }, held)
  if (!next) return { error: `적을 못 만들었다: ${name}` }
  const foes = held ? g.scene.foes.map(f => (f.name === held.name ? next : f)) : [...g.scene.foes, next]
  const game = { ...g, scene: { ...g.scene, foes } }
  return { game: held ? game : logged(game, now, `${next.name} 등장`, 'story'), text: `${held ? '고쳤다' : '등장'}: ${foeText(next)}` }
}

function quest(g: Campaign, input: Record<string, unknown>, now: number): Outcome {
  const title = text(input.title)
  if (!title) return { error: 'quest 에는 title 이 필요하다' }
  const held = g.quests.find(q => q.title === title) ?? g.quests.find(q => q.title.startsWith(title))
  if (input.remove === true) {
    if (!held) return { error: `퀘스트 ${title} 가 없다` }
    return { game: { ...g, quests: g.quests.filter(q => q !== held) }, text: `퀘스트를 지웠다: ${held.title}` }
  }
  const raw = text(input.status)
  const status: QuestStatus | undefined = raw === 'done' || raw === '완료' ? 'done' : raw === 'failed' || raw === '실패' ? 'failed' : raw === 'active' || raw === '진행' ? 'active' : undefined
  const next: Quest = { title: held?.title ?? title, status: status ?? held?.status ?? 'active', note: text(input.note) ?? held?.note ?? '' }
  const quests = held ? g.quests.map(q => (q === held ? next : q)) : [...g.quests, next]
  const word = !held ? '새 퀘스트' : next.status === 'done' ? '퀘스트 완료' : next.status === 'failed' ? '퀘스트 실패' : '퀘스트 갱신'
  return { game: logged({ ...g, quests }, now, `${word}: ${next.title}`, 'quest'), text: `${word}: ${next.title}` }
}

function choices(g: Campaign, input: Record<string, unknown>): Outcome {
  const options = (strings(input.options) ?? []).slice(0, 6)
  return { game: { ...g, choices: options }, text: options.length ? `패널에 선택지 ${options.length}개를 띄웠다. 주인님이 누르면 그 행동이 다음 말로 온다(직접 써도 된다).` : '선택지를 지웠다.' }
}

function secret(g: Campaign, input: Record<string, unknown>): Outcome {
  if (input.clear === true) return { game: { ...g, secrets: [] }, text: '비밀 메모를 비웠다.' }
  const all = strings(input.secrets)
  if (Array.isArray(input.secrets) && all) return { game: { ...g, secrets: all }, text: `비밀 메모를 ${all.length}개로 바꿨다.` }
  const one = text(input.text)
  if (!one) return { error: 'secret 에는 text(하나 더하기) · secrets(통째로 바꾸기) · clear 중 하나가 필요하다' }
  return { game: { ...g, secrets: [...g.secrets, one] }, text: `비밀 메모를 더했다(${g.secrets.length + 1}개). 패널엔 안 보인다.` }
}

/** GM 도구의 고치는 행동을 한곳에서. 파일·화면 일은 부르는 쪽이 한다 */
export function apply(g: Campaign, action: string, input: Record<string, unknown>, now: number, rng: Rng, by: 'player' | 'gm' = 'gm'): Outcome {
  const done = (() => {
    switch (action) {
      case 'character': return character(g, input, now)
      case 'change': return change(g, input, now)
      case 'roll': return moveRoll(g, input, now, rng, by)
      case 'ask': return asking(g, input)
      case 'dice': return dice(g, input, now, rng)
      case 'scene': return scene(g, input, now)
      case 'foe': return foe(g, input, now)
      case 'quest': return quest(g, input, now)
      case 'log': {
        const line = text(input.text)
        return line ? { game: logged(g, now, line, 'story'), text: '기록했다.' } : { error: 'log 에는 text 가 필요하다' }
      }
      case 'secret': return secret(g, input)
      case 'choices': return choices(g, input)
      case 'clock': return clock(g, input)
      case 'meet': {
        const name = text(input.name)
        if (!name) return { error: 'meet 에는 name(알게 된 이름)이 필요하다' }
        const who = text(input.who) ?? ''
        const note = text(input.note) ?? ''
        const held = g.people.find(p => p.name === name)
        const where = `${timeText(g.time)}${g.scene.title ? ` · ${g.scene.title}` : ''}`
        const next: Person = held
          ? { ...held, who: who || held.who, notes: note && !held.notes.includes(note) ? [...held.notes, note] : held.notes }
          : { name, who, met: where, notes: note ? [note] : [] }
        const people = held ? g.people.map(p => (p === held ? next : p)) : [...g.people, next]
        return { game: { ...g, people }, text: `수첩: ${held ? '고쳤다' : '새 사람'} ${name}${next.who ? `(${next.who})` : ''}${note ? ` — ${note}` : ''}` }
      }
      case 'learn': {
        const fact = text(input.text)
        if (!fact) return { error: 'learn 에는 text(알게 된 것 한 줄)가 필요하다' }
        if (g.facts.some(f => f.text === fact)) return { game: g, text: '수첩에 이미 있다.' }
        return { game: { ...g, facts: [...g.facts, { text: fact, source: text(input.source) ?? '', day: g.time.day }] }, text: `수첩: 알게 된 것 — ${fact}` }
      }
      case 'narrate': {
        const line = typeof input.text === 'string' ? input.text : ''
        return line.trim() ? { game: addStory(g, 'gm', line, now), text: '패널 이야기 탭에 썼다. 대화창 답은 한 줄로 줄인다.' } : { error: 'narrate 에는 text(서술 · 마크다운)가 필요하다' }
      }
      case 'time': return passTime(g, input, now)
      default: return { error: `모르는 action: ${action}` }
    }
  })()
  return 'error' in done ? done : { ...done, game: { ...done.game, updatedAt: now } }
}

// ── 글로 옮기기 ──────────────────────────────────────────────────────

export function itemText(i: Item): string {
  return `${i.name}${i.qty > 1 ? `×${i.qty}` : ''}`
}

export function statsText(s: Stats): string {
  return STATS.map(k => `${STAT_LABEL[k]}${signed(s[k])}`).join(' ')
}

export function foeText(f: Foe): string {
  return `${f.name} HP ${f.hp}/${f.maxHp}${f.hp === 0 ? '(쓰러짐)' : ''} 방어${f.armor} 피해${f.damage}${f.note ? ` (${f.note})` : ''}`
}

export function sheetLine(c: Character): string {
  return [
    `${c.name}(${c.role} Lv${c.level}${c.isPlayer ? ', 주인님' : ', 동료'})`,
    `HP ${c.hp}/${c.maxHp} 방어${c.armor} 피해${c.damage}`,
    statsText(c.stats),
    `XP ${c.xp}/${xpNeeded(c)}`,
    c.forward ? `다음 굴림${signed(c.forward)}` : '',
    c.conditions.length ? `상태: ${c.conditions.join(', ')}` : '',
    c.items.length ? `소지품: ${c.items.map(itemText).join(', ')}` : '',
    `금화 ${c.gold}`,
    c.moves.length ? `기술: ${c.moves.join(', ')}` : '',
  ].filter(Boolean).join(' · ')
}

function askText(a: Ask): string {
  return `${a.who} · ${a.move}${a.stat ? `(${STAT_LABEL[a.stat]})` : ''}${a.bonus ? ` 보정${signed(a.bonus)}` : ''}${a.why ? ` — ${a.why}` : ''}`
}

/** GM 이 상태를 다시 볼 때(status) */
export function statusText(g: Campaign, now: number): string {
  const quests = g.quests.map(q => `${q.status === 'done' ? '✓' : q.status === 'failed' ? '✕' : '◆'} ${q.title}${q.note ? ` — ${q.note}` : ''}`)
  return [
    `# ${g.name}`,
    g.premise ? `전제: ${g.premise}` : '',
    `지금: ${timeText(g.time)}`,
    '',
    '## 파티',
    ...(g.party.length ? g.party.map(c => `- ${sheetLine(c)}${c.look ? ` · 외모: ${c.look}` : ''}`) : ['- (아직 없음: character 로 만든다)']),
    '',
    `## 장면: ${g.scene.title || '(없음)'}`,
    g.scene.text,
    g.scene.mapRef ? `지도: ${g.scene.mapRef}${g.scene.fog ? ` · 드러난 표지 ${g.scene.revealed.join(' ') || '없음'}` : ''}${g.scene.at ? ` · 일행 @ ${g.scene.at}${g.scene.rooms[g.scene.at] ? ` ${g.scene.rooms[g.scene.at]}` : ''}` : ''} (방 설명은 lore 로)` : '',
    ...(g.scene.map.length && !g.scene.mapRef ? ['```', ...g.scene.map, '```'] : []),
    ...(g.scene.foes.length ? ['적:', ...g.scene.foes.map(f => `- ${foeText(f)}`)] : []),
    '',
    '## 퀘스트',
    ...(quests.length ? quests : ['(없음)']),
    '',
    '## 수첩: 아는 사람',
    ...(g.people.length ? g.people.map(p => `- ${p.name}${p.who ? ` (${p.who})` : ''} · 만남 ${p.met}${p.notes.length ? ` · ${p.notes.join(' / ')}` : ''}`) : ['(없음)']),
    '',
    '## 수첩: 알게 된 것',
    ...(g.facts.length ? g.facts.map(f => `- ${f.text}${f.source ? ` (${f.source})` : ''}`) : ['(없음)']),
    '',
    '## 시계',
    ...(g.clocks.length ? g.clocks.map(c => `- ${clockText(c)}`) : ['(없음)']),
    '',
    `## 대기 중: ${g.ask ? `굴림 요청 ${askText(g.ask)}` : g.choices.length ? `선택지 ${g.choices.map((c, i) => `${i + 1}) ${c}`).join(' ')}` : '없음'}`,
    '',
    '## 최근 굴림',
    ...(g.rolls.length ? g.rolls.slice(-6).map(r => `- ${rollLine(r)} (${ago(r.at, now)}${r.by === 'player' ? ', 주인님이 굴림' : ''})`) : ['(없음)']),
    '',
    '## 최근 기록',
    ...g.log.slice(-12).map(l => `- ${l.text}`),
    '',
    '## GM 비밀 메모 (주인님께 말하지 않는다)',
    ...(g.secrets.length ? g.secrets.map(s => `- ${s}`) : ['(없음)']),
  ].filter((line, i, all) => !(line === '' && all[i - 1] === '')).join('\n')
}

/** 진행 중에 주인님 말마다 GM 에게 같이 보내는 짧은 상태 */
export function contextText(g: Campaign): string {
  const lines = [
    `[clawd-trpg] TRPG 진행 중. 너는 GM 미미짱이다. 진행 규칙은 clawd-trpg:gm 스킬(이번 대화에서 안 읽었으면 먼저 읽는다). 주사위는 꼭 trpg_panel 로 굴리고, 바뀐 상태(HP·소지품·장면·퀘스트)는 서술과 함께 trpg_panel 로 반영한다. 주인님은 패널만 본다: 서술 · 질문 · 안내는 모두 trpg_panel narrate 로 패널에 쓰고, 대화창 답은 한 줄(무엇을 했는지)로 줄인다. narrate 는 냥체 없이 테이블 GM 의 몰입감 있는 구어체(「당신」, 현재형, 해요체 · 합니다체)로 쓴다.`,
    `캠페인 「${g.name}」${g.premise ? ` — ${g.premise}` : ''} · 지금 ${timeText(g.time)}`,
    ...g.party.map(c => `- ${sheetLine(c)}`),
    `장면: ${g.scene.title || '(없음)'}${g.scene.mapRef ? ` · 지도 ${g.scene.mapRef}${g.scene.at ? ` · 일행 @ ${g.scene.at}${g.scene.rooms[g.scene.at] ? ` ${g.scene.rooms[g.scene.at]}` : ''}` : ''}${g.scene.fog ? ` · 드러난 곳 ${g.scene.revealed.join(' ')}` : ''}` : ''}${g.scene.foes.length ? ` · 적: ${g.scene.foes.map(foeText).join(', ')}` : ''}`,
    g.clocks.length ? `시계: ${g.clocks.map(clockText).join(' / ')}` : '',
    `주인님 캐릭터가 아는 이름: ${g.people.length ? g.people.map(p => `${p.name}${p.who ? `(${p.who})` : ''}`).join(', ') : '아직 없음'} — 이 밖의 사람 · 장소는 이름 대신 겉모습으로 부른다. 새로 이름을 알게 되면 meet, 단서를 알게 되면 learn 으로 수첩에 적는다.`,
    g.quests.some(q => q.status === 'active') ? `진행 중 퀘스트: ${g.quests.filter(q => q.status === 'active').map(q => q.title).join(', ')}` : '',
    g.ask ? `대기 중인 굴림 요청: ${askText(g.ask)} (주인님이 굴려 달라고 하면 roll 을 인자 없이)` : '',
    g.choices.length ? `패널 선택지: ${g.choices.join(' / ')}` : '',
    g.rolls.length ? `마지막 굴림: ${rollLine(g.rolls[g.rolls.length - 1]!)}` : '',
    g.secrets.length ? `GM 비밀 메모(말하지 않는다): ${g.secrets.join(' / ').slice(0, 800)}` : '',
  ]
  return lines.filter(Boolean).join('\n')
}

export function summaryOf(g: Campaign): string {
  const pc = g.party.find(c => c.isPlayer) ?? g.party[0]
  return [pc ? `${pc.name} ${pc.role} Lv${pc.level}` : '캐릭터 없음', g.scene.title].filter(Boolean).join(' · ')
}

export function saveInfo(g: Campaign): SaveInfo {
  return { slug: g.slug, name: g.name, updatedAt: g.updatedAt, summary: summaryOf(g) }
}

// ── 저장 파일 읽기(손으로 고친 파일도 받아 준다) ─────────────────────

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function toCharacter(value: unknown): Character | undefined {
  const o = obj(value)
  const name = text(o.name)
  if (!name) return undefined
  const base = blankCharacter(name, o.isPlayer === true)
  const maxHp = Math.max(1, int(o.maxHp) ?? base.maxHp)
  return {
    ...base,
    role: text(o.role) || base.role,
    level: Math.max(1, int(o.level) ?? 1),
    xp: Math.max(0, int(o.xp) ?? 0),
    maxHp,
    hp: clamp(int(o.hp) ?? maxHp, 0, maxHp),
    armor: Math.max(0, int(o.armor) ?? 0),
    damage: text(o.damage) || base.damage,
    stats: toStats(o.stats, blankStats()),
    items: items(o.items) ?? [],
    gold: Math.max(0, int(o.gold) ?? 0),
    conditions: strings(o.conditions) ?? [],
    moves: strings(o.moves) ?? [],
    look: text(o.look) ?? '',
    forward: int(o.forward) ?? 0,
  }
}

function toRoll(value: unknown): Roll | undefined {
  const o = obj(value)
  const id = int(o.id)
  const total = int(o.total)
  if (id === undefined || total === undefined) return undefined
  const tier = o.tier === 'strong' || o.tier === 'weak' || o.tier === 'miss' ? o.tier : undefined
  const stat = toStat(o.stat)
  return {
    id, total, at: int(o.at) ?? 0, who: text(o.who) ?? '', what: text(o.what) ?? '', expr: text(o.expr) ?? '',
    groups: arr(o.groups).map(gr => ({ sides: int(obj(gr).sides) ?? 6, values: arr(obj(gr).values).map(v => int(v) ?? 0) })),
    mod: int(o.mod) ?? 0, by: o.by === 'player' ? 'player' : 'gm',
    ...(tier ? { tier } : {}), ...(stat ? { stat } : {}),
    ...(text(o.target) ? { target: text(o.target)!, dealt: int(o.dealt) ?? 0 } : {}),
  }
}

export function normalize(raw: unknown, now: number): Campaign | undefined {
  const o = obj(raw)
  const name = text(o.name)
  if (!name) return undefined
  const scene = obj(o.scene)
  const ask = obj(o.ask)
  const askStat = toStat(ask.stat)
  const rolls = arr(o.rolls).map(toRoll).filter((r): r is Roll => !!r)
  return {
    version: 1,
    name,
    slug: text(o.slug) || slugOf(name),
    premise: text(o.premise) ?? '',
    createdAt: int(o.createdAt) ?? now,
    updatedAt: int(o.updatedAt) ?? now,
    party: arr(o.party).map(toCharacter).filter((c): c is Character => !!c),
    scene: {
      title: text(scene.title) ?? '',
      text: text(scene.text) ?? '',
      map: arr(scene.map).map(String),
      foes: arr(scene.foes).map(f => toFoe(f)).filter((f): f is Foe => !!f),
      mapRef: text(scene.mapRef) ?? '',
      fog: scene.fog === true,
      revealed: strings(scene.revealed) ?? [],
      at: text(scene.at) ?? '',
      rooms: Object.fromEntries(Object.entries(obj(scene.rooms)).filter((e): e is [string, string] => typeof e[1] === 'string')),
      glyphs: Object.fromEntries(Object.entries(obj(scene.glyphs)).filter((e): e is [string, string] => typeof e[1] === 'string')),
    },
    quests: arr(o.quests).map(q => {
      const qo = obj(q)
      const status: QuestStatus = qo.status === 'done' || qo.status === 'failed' ? qo.status : 'active'
      return { title: text(qo.title) ?? '', status, note: text(qo.note) ?? '' }
    }).filter(q => q.title),
    rolls,
    log: arr(o.log).map(l => {
      const lo = obj(l)
      const kind = (['story', 'roll', 'loot', 'hp', 'quest', 'system'] as const).find(k => k === lo.kind) ?? 'story'
      return { at: int(lo.at) ?? 0, text: text(lo.text) ?? '', kind }
    }).filter(l => l.text),
    secrets: strings(o.secrets) ?? [],
    choices: strings(o.choices) ?? [],
    ask: text(ask.move) ? { move: text(ask.move)!, bonus: int(ask.bonus) ?? 0, who: text(ask.who) ?? '', why: text(ask.why) ?? '', ...(askStat ? { stat: askStat } : {}) } : null,
    nextRollId: Math.max(int(o.nextRollId) ?? 1, ...rolls.map(r => r.id + 1)),
    clocks: arr(o.clocks).flatMap((c): Clock[] => {
      const co = obj(c)
      const name = text(co.name)
      const size = clamp(int(co.size) ?? 6, 2, 12)
      return name ? [{ name, size, filled: clamp(int(co.filled) ?? 0, 0, size), visible: co.visible !== false, note: text(co.note) ?? '' }] : []
    }),
    time: { day: Math.max(1, int(obj(o.time).day) ?? 1), part: clamp(int(obj(o.time).part) ?? 1, 0, 4) },
    people: arr(o.people).flatMap((p): Person[] => {
      const po = obj(p)
      const name = text(po.name)
      return name ? [{ name, who: text(po.who) ?? '', met: text(po.met) ?? '', notes: strings(po.notes) ?? [] }] : []
    }),
    facts: arr(o.facts).flatMap((f): Fact[] => {
      const fo = obj(f)
      const t = text(fo.text)
      return t ? [{ text: t, source: text(fo.source) ?? '', day: int(fo.day) ?? 1 }] : []
    }),
    story: arr(o.story).flatMap((l): StoryLine[] => {
      const lo = obj(l)
      const t = typeof lo.text === 'string' ? lo.text : ''
      return t ? [{ at: int(lo.at) ?? 0, who: lo.who === 'player' ? 'player' : 'gm', text: t }] : []
    }),
  }
}
