// clawd-trpg: /trpg 로 여닫는 TRPG 패널. 미미짱이 GM 이고 주인님이 플레이어.
// 2d6 판타지 던전(PbtA 식): 캐릭터 시트 · 장면 · 주사위 · 퀘스트를 패널에 띄우고,
// GM 은 trpg_panel 도구로 굴리고 고치고, 주인님은 패널 버튼으로 주사위를 굴리거나 선택지를 고른다.
// 캠페인은 ~/.local/share/clawd-deck/trpg/<이름>.json 에 저장해 다음 세션에 이어 한다.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import type { Campaign, Character, Roll, SaveInfo, Tier } from '../types'
import type { WorldFile } from './world'
import { indexText, loreText, mapOf, renderMap, searchText } from './world'
import type { Zoom } from './art'
import { TILE, ZOOM_LABEL, paintMap } from './art'
import {
  STAT_LABEL,
  TIER_LABEL,
  ago,
  apply,
  bar,
  cells,
  contextText,
  cryptoRng,
  die,
  itemText,
  newCampaign,
  normalize,
  addStory,
  pad,
  saveInfo,
  signed,
  slugOf,
  statusText,
  timeText,
  xpNeeded,
} from './game'
import { STATS } from './game'

type $ = EngineInterface

const PANE = 'trpg'
const TOOL = 'mcp__clawd-trpg__trpg_panel'
const FRAMES = 8
const FRAME_MS = 70

const TOOL_DESCRIPTION = [
  'TRPG(2d6 판타지 던전, PbtA 식)의 GM 도구. 사용자 화면 오른쪽 TRPG 패널(clawd-trpg)에 캐릭터 시트 · 장면 · 주사위 · 퀘스트를 띄우고 캠페인을 파일로 저장한다.',
  'GM 진행 규칙은 clawd-trpg:gm 스킬: 게임을 시작하거나 이어 하기 전에 먼저 읽는다. 주사위 숫자는 절대 지어내지 말고 roll · dice 로만 굴린다.',
  '미리 만든 세계(잿빛 변경: 바이블 · 룰북 · 도감 · 표 · 지역 지도 · 5장 캠페인)가 있다. 즉석으로 지어내기 전에 lore 로 꺼내 쓴다.',
  '주인님은 패널만 본다: 서술 · 질문 · 안내는 모두 narrate 로 패널 이야기 탭에 쓰고, 대화창 답은 한 줄로 줄인다.',
  'action:',
  '- meet(name, who, note): 수첩에 사람 — 캐릭터가 이름을 알게 된 순간에(소개 · 누가 부름 · 간판). who 는 정체 한 줄, note 는 알게 된 점 한 줄(다시 부르면 덧붙는다)',
  '- learn(text, source): 수첩에 알게 된 것(단서 · 소문 · 사실) 한 줄과 누구에게서',
  '- narrate(text): 패널 이야기 탭에 GM 서술을 쓴다(마크다운. 굵게 · 목록 · 표 · 「대사」). 한 턴에 한 번, 선택지 · 굴림 요청과 함께',
  '- lore(ref | query): 세계 문서. 인자 없으면 목차, ref "bible" 은 파일 개요와 목차, "ashtower#f1-3" 은 그 구역, query 는 찾기',
  '- status: 지금 상태 전부(GM 비밀 메모 포함). 새 대화나 요약 뒤엔 먼저 부른다.',
  '- list · new(campaign, premise) · load(campaign, 비우면 최근 것) · end(저장하고 내리기) · open · close',
  '- character(name, role, isPlayer, level, xp, hp, maxHp, armor, damage, stats{str,dex,con,int,wis,cha 보정치}, items, gold, conditions, moves, look, remove): 만들기 · 준 칸만 고치기(값 그대로 넣기)',
  '- change(who, hp, xp, gold, forward, addItems, removeItems, addConditions, removeConditions): 더하고 빼기(hp -3 은 3 깎기). who 를 비우면 주인님 캐릭터, 적 이름이면 hp 만',
  '- ask(move, stat, bonus, who, why): 주인님께 2d6 굴림을 부탁한다(패널에 굴리기 버튼). 부른 뒤엔 응답을 끝내고 결과를 기다린다',
  '- roll(move, stat, bonus, who): GM 이 2d6 판정을 바로 굴린다(동료 · 주인님이 "굴려줘" 할 때). 인자 없이 부르면 대기 중인 ask 그대로',
  '- dice(expr, why, who, target, ignoreArmor): 피해 · 표 굴림("d8+1", "2d6", "d100"). target 을 주면 그 적이나 캐릭터의 HP 를 (합계 - 방어)만큼 깎는다',
  '- scene(title, text, map, foes, reveal, at): 장면. map 에 세계 지도 참조("ashtower#f1", 방 참조 "ashtower#f1-2" 면 일행이 그 방)를 주면 미리 그린 지도를 안개 낀 채 띄운다. reveal: 드러낼 표지들, at: 일행이 있는 표지. title 이 바뀌면 새 장면이라 안 준 지도 · 적은 비운다',
  '- clock(name, size, tick, set, visible, note, remove): 위협 시계(칸 채우기). visible false 면 패널에 안 보임 · time(advance | day, part): 시간 흐름(하루 = 새벽 · 아침 · 낮 · 해 질 녘 · 밤)',
  '- foe(name, hp, maxHp, armor, damage, note, remove): 적 하나 넣기 · 고치기 · 빼기',
  '- quest(title, status active|done|failed, note, remove) · log(text): 중요한 사건 한 줄 · secret(text | secrets | clear): GM 만 아는 메모(패널에 안 보임)',
  '- choices(options): 패널에 선택지 버튼 2~4개. 서술을 마칠 때 붙인다',
].join('\n')

const ITEM_LIST = { type: 'array', items: {}, description: '"횃불×3" 같은 글 또는 { name, qty, note }' }
const TEXT_LIST = { type: 'array', items: { type: 'string' } }
const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['meet', 'learn', 'narrate', 'lore', 'status', 'list', 'new', 'load', 'end', 'open', 'close', 'character', 'change', 'ask', 'roll', 'dice', 'scene', 'foe', 'quest', 'log', 'secret', 'choices', 'clock', 'time'] },
    ref: { type: 'string', description: 'lore: "파일id" 또는 "파일id#앵커"' },
    query: { type: 'string', description: 'lore: 찾을 낱말' },
    reveal: { type: 'array', items: { type: 'string' }, description: 'scene: 안개를 걷을 표지들(방 "1" · 통로 "a")' },
    at: { type: 'string', description: 'scene: 일행이 있는 표지(그 자리에 @, 그곳도 드러난다)' },
    zoom: { type: 'integer', description: 'scene: 패널 지도 확대 0 맞춤 · 1 · 2 · 3(4배) · 4(6배) · 5(8배). 크게 보면 일행 둘레만' },
    size: { type: 'integer', description: 'clock: 칸 수(4 · 6 · 8 · 12)' },
    tick: { type: 'integer', description: 'clock: 채울 칸(음수면 비움)' },
    set: { type: 'integer', description: 'clock: 찬 칸을 이 값으로' },
    visible: { type: 'boolean', description: 'clock: 주인님께 보이나(기본 true)' },
    advance: { type: 'integer', description: 'time: 흐를 때 수(하루 = 5)' },
    day: { type: 'integer', description: 'time: 날짜로 맞추기' },
    part: { type: 'string', enum: ['새벽', '아침', '낮', '해 질 녘', '밤'], description: 'time: 때로 맞추기' },
    campaign: { type: 'string', description: 'new · load: 캠페인 이름' },
    premise: { type: 'string', description: 'new: 한두 문장 전제' },
    overwrite: { type: 'boolean', description: 'new: 같은 이름 저장을 덮어쓴다' },
    name: { type: 'string', description: 'character · foe · clock: 이름' },
    role: { type: 'string', description: 'character: 직업(전사 · 도적 · 마법사 · 성직자 · 레인저 · 음유시인)' },
    isPlayer: { type: 'boolean', description: 'character: 주인님 캐릭터면 true(동료 NPC 는 false)' },
    level: { type: 'integer' },
    xp: { type: 'integer', description: 'character: 값 · change: 더할 양' },
    hp: { type: 'integer', description: 'character · foe: 지금 HP · change: 더할 양(피해는 음수)' },
    maxHp: { type: 'integer' },
    armor: { type: 'integer' },
    damage: { type: 'string', description: '피해 주사위 "d10"' },
    stats: { type: 'object', description: '보정치 -1~+3: { str, dex, con, int, wis, cha }', properties: Object.fromEntries(STATS.map(s => [s, { type: 'integer' }])) },
    items: ITEM_LIST,
    gold: { type: 'integer', description: 'character: 값 · change: 더할 양' },
    conditions: TEXT_LIST,
    moves: { ...TEXT_LIST, description: 'character: 직업 기술 이름들' },
    look: { type: 'string', description: 'character: 외모 · 성격 한 줄' },
    remove: { type: 'boolean', description: 'character · foe · quest: 빼기' },
    who: { type: 'string', description: '캐릭터(또는 change 에선 적) 이름. 비우면 주인님 캐릭터 · meet: 그 사람의 정체 한 줄' },
    source: { type: 'string', description: 'learn: 누구에게서 · 어디서 알았나' },
    forward: { type: 'integer', description: 'change: 다음 굴림 한 번에 더할 보정' },
    addItems: ITEM_LIST,
    removeItems: { ...ITEM_LIST, description: '이름만이면 모두, "횃불×1" 이면 그만큼' },
    addConditions: TEXT_LIST,
    removeConditions: TEXT_LIST,
    move: { type: 'string', description: 'ask · roll: 기술 이름(위험에 맞서기 · 베고 찌르기 …)' },
    stat: { type: 'string', enum: ['str', 'dex', 'con', 'int', 'wis', 'cha'] },
    bonus: { type: 'integer', description: 'ask · roll: 상황 보정' },
    why: { type: 'string', description: 'ask: 무엇을 하려는지 · dice: 무엇을 굴리는지' },
    expr: { type: 'string', description: 'dice: "d8+1" · "2d6" · "d100"' },
    target: { type: 'string', description: 'dice: 피해를 받을 적 · 캐릭터 이름' },
    ignoreArmor: { type: 'boolean' },
    title: { type: 'string', description: 'scene · quest: 제목' },
    text: { type: 'string', description: 'narrate: 서술(마크다운) · scene: 두세 문장 · log · secret: 한 줄' },
    map: { type: 'string', description: 'scene: 세계 지도 참조("ashtower#f1") 또는 손으로 그린 ASCII 지도(줄바꿈으로, 폭 40칸 · 12줄 안쪽)' },
    foes: { type: 'array', items: { type: 'object' }, description: 'scene: [{ name, hp, maxHp, armor, damage, note }]' },
    status: { type: 'string', enum: ['active', 'done', 'failed'] },
    note: { type: 'string', description: 'foe · quest · clock: 한 줄 메모' },
    secrets: TEXT_LIST,
    clear: { type: 'boolean' },
    options: { ...TEXT_LIST, description: 'choices: 선택지(비우면 지운다)' },
  },
  required: ['action'],
  additionalProperties: false,
}

const NEW_PROMPT = '새 TRPG 모험을 시작하자냥! clawd-trpg:gm 스킬을 읽고 GM 을 맡아 줘.'
const continuePrompt = (name: string) => `TRPG 「${name}」 이어서 하자냥. clawd-trpg:gm 스킬을 읽고, 지난 이야기를 짧게 되짚은 뒤 지금 장면부터 이어 줘.`

// 덱과 같은 색
const BLUE = '#7aa2f7'
const GOLD = '#e0af68'
const GREEN = '#8fd07f'
const YELLOW = '#f0c04a'
const RED = '#ee6a5e'
const PURPLE = '#bb9af7'
const MAP = '#a9b1d6'
const TIER_COLOR: Record<Tier, string> = { strong: GREEN, weak: YELLOW, miss: RED }
const TIER_SHOUT: Record<Tier, string> = { strong: '강한 성공!', weak: '약한 성공 — 대가가 따른다', miss: '실패… 위험이 닥친다' }

const game = atom({ plugin: 'clawd-trpg', key: 'game' } as const, null)
const open = atom({ plugin: 'clawd-trpg', key: 'open' } as const, false)
const saves = atom({ plugin: 'clawd-trpg', key: 'saves' } as const, [])
const tumble = atom({ plugin: 'clawd-trpg', key: 'tumble' } as const, null)
const savedAt = atom({ plugin: 'clawd-trpg', key: 'savedAt' } as const, 0)
const problem = atom({ plugin: 'clawd-trpg', key: 'problem' } as const, '')
const showLog = atom({ plugin: 'clawd-trpg', key: 'showLog' } as const, false)
const lobby = atom({ plugin: 'clawd-trpg', key: 'lobby' } as const, [])
const plainMap = atom({ plugin: 'clawd-trpg', key: 'plainMap' } as const, false)
const mapZoom = atom({ plugin: 'clawd-trpg', key: 'mapZoom' } as const, 0)
const view = atom({ plugin: 'clawd-trpg', key: 'view' } as const, 'story')
const draft = atom({ plugin: 'clawd-trpg', key: 'draft' } as const, '')

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function clock(at: number): string {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** hook 이 끝난 뒤에도 이어지는 일은 타이머로(버튼 반응을 막지 않게) */
function later($: $, work: () => Promise<void>): void {
  $.clock.after(0, () => {
    work().catch(async err => update($, problem, () => message(err)))
  })
}

// ── 세계 문서 ────────────────────────────────────────────────────────

/** world/*.md. 모듈이 다시 올라오면 다시 읽는다 */
let worldFiles: WorldFile[] | null = null

async function world($: $): Promise<WorldFile[]> {
  if (worldFiles) return worldFiles
  const found: WorldFile[] = []
  const walk = async (dir: string, rel: string): Promise<void> => {
    if (!(await $.fs.exists(dir))) return
    for (const entry of await $.fs.list(dir)) {
      const path = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.kind === 'dir') await walk(`${dir}/${entry.name}`, path)
      else if (entry.kind === 'file' && entry.name.endsWith('.md')) found.push({ id: entry.name.slice(0, -3), path, text: await $.fs.read(`${dir}/${entry.name}`) })
    }
  }
  await walk(`${$.plugin.root}/world`, '')
  worldFiles = found
  return found
}

const MAP_REF = /^[a-z0-9-]+#[a-z0-9-]+$/

// ── 저장 ─────────────────────────────────────────────────────────────

async function saveDir($: $): Promise<string> {
  const data = await $.env.get('XDG_DATA_HOME')
  const home = await $.env.get('HOME')
  return `${data || `${home ?? '.'}/.local/share`}/clawd-deck/trpg`
}

async function persist($: $, g: Campaign): Promise<void> {
  try {
    await $.fs.write(`${await saveDir($)}/${g.slug}.json`, `${JSON.stringify(g, null, 2)}\n`)
    await $.store.set('last', g.slug)
    const now = await $.clock.now()
    await update($, savedAt, () => now)
    await update($, problem, () => '')
  } catch (err) {
    await update($, problem, () => `저장 못 했다냥: ${message(err)}`)
  }
}

/** 상태를 바꾸고 파일에도 쓴다 */
async function commit($: $, g: Campaign): Promise<void> {
  await update($, game, () => g)
  await persist($, g)
}

async function readCampaign($: $, slug: string): Promise<Campaign | undefined> {
  const raw = await $.fs.read(`${await saveDir($)}/${slug}.json`)
  const g = normalize(JSON.parse(raw), await $.clock.now())
  return g && { ...g, slug }
}

async function loadSaves($: $): Promise<SaveInfo[]> {
  const dir = await saveDir($)
  const found: SaveInfo[] = []
  if (await $.fs.exists(dir)) {
    for (const entry of await $.fs.list(dir)) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue
      try {
        const g = await readCampaign($, entry.name.slice(0, -5))
        if (g) found.push(saveInfo(g))
      } catch {
        // 깨진 파일은 목록에서만 뺀다
      }
    }
  }
  found.sort((a, b) => b.updatedAt - a.updatedAt)
  await update($, saves, () => found)
  return found
}

function savesText(list: readonly SaveInfo[], now: number): string {
  return list.length ? `저장된 캠페인:\n${list.map(s => `- ${s.name} (${s.summary}, ${ago(s.updatedAt, now)})`).join('\n')}` : '저장된 캠페인이 없다.'
}

function pick(list: readonly SaveInfo[], want: string): SaveInfo | undefined {
  if (!want) return list[0]
  const low = want.toLowerCase()
  return list.find(s => s.name.toLowerCase() === low || s.slug === slugOf(want)) ?? list.find(s => s.name.toLowerCase().includes(low))
}

/** 불러와서 게임 중으로 */
async function loadCampaign($: $, want: string): Promise<Campaign | string> {
  const list = await loadSaves($)
  const hit = pick(list, want)
  if (!hit) return `${want ? `"${want}" 캠페인을 못 찾았다. ` : ''}${savesText(list, await $.clock.now())}`
  const g = await readCampaign($, hit.slug)
  if (!g) return `${hit.slug}.json 을 못 읽었다.`
  await update($, game, () => g)
  await update($, tumble, () => null)
  await openPane($)
  return g
}

// ── 패널 ─────────────────────────────────────────────────────────────

/** 패널 폭: 지금 지도가 두 배로 들어갈 만큼(60~110칸). 사람이 끌어 바꾼 폭이 이긴다 */
function paneColumns(g: Campaign | null): number {
  const w = g?.scene.mapRef ? Math.max(0, ...g.scene.map.map(r => r.length)) : 0
  return Math.min(110, Math.max(60, w * TILE[2][0] + 6))
}

async function openPane($: $, focus = false): Promise<string> {
  const placed = await $.ui.open({ id: PANE, title: 'TRPG', columns: paneColumns(await read($, game)), ...(focus ? { focus: true as const } : {}) })
  await update($, open, () => true)
  return placed.isPlaced ? '' : ' (터미널이 좁아 패널이 아직 안 보인다: 입력창 위 띠로 굴릴 수 있다)'
}

async function closePane($: $): Promise<void> {
  await $.ui.close({ id: PANE })
  await update($, open, () => false)
}

/** 굴린 주사위가 패널에서 잠깐 구르다 멈춘다. 다 멈추면 then */
function roll3d($: $, roll: Roll, then?: () => Promise<void>): void {
  let frame = 0
  const step = () => {
    frame += 1
    if (frame > FRAMES) {
      void update($, tumble, () => null).then(() => then?.())
      return
    }
    const faces = roll.groups.flatMap(g => g.values.map(() => die(g.sides, cryptoRng)))
    void update($, tumble, () => ({ rollId: roll.id, frame, faces }))
    $.clock.after(FRAME_MS, step)
  }
  step()
}

/** 패널 버튼으로 주인님 대신 말을 보낸다. 플러그인이 보낸 말은 자기 prompt.submit 훅을 안 거쳐서
 *  지금 상태는 그 앞에 숨은 메모로 붙인다 */
async function tell($: $, text: string, record = true): Promise<void> {
  if (record) {
    const now = await $.clock.now()
    await update($, game, held => (held ? addStory(held, 'player', text, now) : held))
    const saved = await read($, game)
    if (saved) await persist($, saved)
  }
  const g = await read($, game)
  if (g && (await read($, open))) {
    await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: contextText(g) }] } }).catch(() => undefined)
  }
  await $.prompt.submit({ text, asUser: true })
}

/** 패널 · 띠의 굴리기 버튼: 주인님이 직접 굴리고 결과를 GM 에게 보낸다 */
async function playerRoll($: $): Promise<void> {
  const g = await read($, game)
  if (!g?.ask || (await read($, tumble))) return
  const out = apply(g, 'roll', {}, await $.clock.now(), cryptoRng, 'player')
  if ('error' in out) {
    await update($, problem, () => out.error)
    return
  }
  await commit($, out.game)
  if (out.roll) roll3d($, out.roll, async () => {
    await tell($, `🎲 주인님이 굴렸다냥\n${out.text}`)
  })
}

async function choose($: $, index: number): Promise<void> {
  const g = await read($, game)
  const picked = g ? g.choices[index] : (await read($, lobby))[index]
  if (!picked) return
  if (g) await commit($, { ...g, choices: [] })
  else await update($, lobby, () => [])
  await tell($, `▶ ${picked}`)
}

async function startNew($: $): Promise<void> {
  await update($, game, () => null)
  await update($, lobby, () => [])
  await openPane($)
  await $.prompt.submit({ text: NEW_PROMPT, asUser: true })
}

async function resume($: $, want: string): Promise<string> {
  const g = await loadCampaign($, want)
  if (typeof g === 'string') return g
  await tell($, continuePrompt(g.name), false)
  return `「${g.name}」 을(를) 불러왔다냥`
}

// ── GM 도구 ──────────────────────────────────────────────────────────

async function steer($: $, input: Record<string, unknown>): Promise<string> {
  const action = typeof input.action === 'string' ? input.action : ''
  const now = await $.clock.now()
  const named = typeof input.campaign === 'string' ? input.campaign.trim() : ''
  switch (action) {
    case 'lore': {
      const files = await world($)
      if (!files.length) return '세계 문서(world/)가 없다.'
      const query = typeof input.query === 'string' ? input.query.trim() : ''
      const ref = typeof input.ref === 'string' ? input.ref.trim() : ''
      return query ? searchText(files, query) : ref ? loreText(files, ref) : indexText(files)
    }
    case 'open': return `TRPG 패널을 열었다.${await openPane($)}`
    case 'close':
      await closePane($)
      return 'TRPG 패널을 닫았다(게임은 쉬는 중: 주인님 말에 상태를 붙이지 않는다).'
    case 'list': return savesText(await loadSaves($), now)
    case 'new': {
      if (!named) return 'new 에는 campaign(캠페인 이름)이 필요하다.'
      const g = newCampaign(named, typeof input.premise === 'string' ? input.premise : '', now)
      const path = `${await saveDir($)}/${g.slug}.json`
      if ((await $.fs.exists(path)) && input.overwrite !== true) return `같은 이름의 저장이 있다: ${path}. load 로 이어 하거나 다른 이름을 쓴다(덮어쓰려면 overwrite: true).`
      await commit($, g)
      await update($, lobby, () => [])
      const note = await openPane($)
      later($, async () => void (await loadSaves($)))
      return `새 캠페인 「${g.name}」 을 만들었다(저장: ${path}).${note}\n다음: character 로 주인님 캐릭터를 만들고, scene 으로 첫 장면을 연다.`
    }
    case 'load': {
      const g = await loadCampaign($, named)
      return typeof g === 'string' ? g : `「${g.name}」 을 불러왔다.\n\n${statusText(g, now)}`
    }
    case 'end': {
      const g = await read($, game)
      if (g) await persist($, g)
      await update($, game, () => null)
      await closePane($)
      return g ? `「${g.name}」 을 저장하고 내렸다.` : '내릴 캠페인이 없다.'
    }
  }
  const g = await read($, game)
  if (!g && action === 'choices') {
    // 캠페인을 만들기 전(모험 실마리 · 직업 고르기)엔 시작 화면에 띄운다
    const options = (Array.isArray(input.options) ? input.options : []).filter((o): o is string => typeof o === 'string' && o.trim() !== '').map(o => o.trim()).slice(0, 6)
    await update($, lobby, () => options)
    const note = await openPane($)
    return options.length ? `시작 화면에 선택지 ${options.length}개를 띄웠다. 주인님이 누르면 다음 말로 온다(직접 써도 된다).${note}` : '선택지를 지웠다.'
  }
  if (!g) return `진행 중인 캠페인이 없다. new 로 시작하거나 load 로 불러온다.\n${savesText(await loadSaves($), now)}`
  if (action === 'status') return statusText(g, now)
  let args = input
  // 패널 지도 확대는 화면 일이라 여기서
  if (action === 'scene' && typeof input.zoom === 'number') {
    const z = Math.max(0, Math.min(5, Math.round(input.zoom)))
    await update($, mapZoom, () => z)
    const { zoom: _, action: __, ...rest } = input
    if (!Object.keys(rest).length) return `패널 지도를 ${z ? `${['', '1배', '2배', '4배', '6배', '8배'][z]}로` : '폭에 맞춰'} 그린다.`
    args = { ...input }
    delete args.zoom
  }
  // 미리 그린 세계 지도 참조면 지도를 꺼내 넘긴다
  if (action === 'scene' && typeof input.map === 'string' && MAP_REF.test(input.map.trim())) {
    const found = mapOf(await world($), input.map.trim())
    if (typeof found === 'string') return `안 됐다: ${found}`
    args = { ...input, map: undefined, world: found }
  }
  // 동시에 온 호출이 서로 덮어쓰지 않게 지금 값 위에서 고친다(다시 시도하면 주사위도 다시 굴린다)
  let out: ReturnType<typeof apply> = { error: '캠페인이 없다' }
  await update($, game, held => {
    if (!held) return held
    out = apply(held, action, args, now, cryptoRng)
    return 'error' in out ? held : out.game
  })
  const done = out as ReturnType<typeof apply>
  if ('error' in done) return `안 됐다: ${done.error}`
  const saved = await read($, game)
  if (saved) await persist($, saved)
  // 큰 지도를 띄우면 패널을 넓혀 달라고 한다
  if (args.world && (await read($, open))) await openPane($)
  if (done.roll) roll3d($, done.roll)
  // GM 이 패널에 쓰면 키보드를 패널 입력칸으로(대화창에 쓰던 글이 있으면 엔진이 거절한다)
  if ((action === 'narrate' || action === 'choices' || action === 'ask') && (await read($, open))) {
    await openPane($, true)
    await update($, view, () => 'story')
  }
  return done.text
}

// ── 그리기 도우미 ────────────────────────────────────────────────────

/** ╭───╮ 주사위 그림 세 줄 */
function diceArt(values: readonly number[]): [string, string, string] {
  const face = (v: number) => (v < 10 ? ` ${v} ` : v < 100 ? `${v} ` : String(v))
  return [values.map(() => '╭───╮').join(' '), values.map(v => `│${face(v)}│`).join(' '), values.map(() => '╰───╯').join(' ')]
}

function hpColor(hp: number, max: number): string {
  const r = max > 0 ? hp / max : 0
  return r > 0.6 ? GREEN : r > 0.3 ? YELLOW : RED
}

// ── 훅 ───────────────────────────────────────────────────────────────

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'trpg',
      description: 'TRPG 패널 열기·닫기(미미짱이 GM) · /trpg 새 게임 · /trpg 이어 하기 · /trpg 끝 · /trpg 캠페인 이름',
      argumentHint: '[새 게임 | 이어 하기 | 끝 | 캠페인 이름]',
      immediate: true,
    })
    await $.tool.register({ name: 'trpg_panel', description: TOOL_DESCRIPTION, inputSchema: TOOL_SCHEMA, isDeferred: false })
    // 다시 올라왔을 때 세션에 남은 캠페인을 지금 모양으로(새로 생긴 칸 채우기)
    const now = await $.clock.now()
    await update($, game, held => (held ? normalize(held, now) ?? held : held))
    return next(e)
  })

  on('command.run', { command: 'trpg' }, async ($, e) => {
    const arg = e.args.trim()
    if (!arg) {
      if (await read($, open)) {
        await closePane($)
        return { text: 'TRPG 패널을 닫았다냥. 게임은 쉬는 중(/trpg 로 다시 연다냥)' }
      }
      const note = await openPane($, true)
      later($, async () => void (await loadSaves($)))
      const g = await read($, game)
      return { text: g ? `「${g.name}」 패널을 열었다냥${note}` : `TRPG 패널을 열었다냥. 패널의 [새 모험] 이나 /trpg 새 게임 · /trpg 이어 하기${note}` }
    }
    if (/^(새|new)/i.test(arg)) {
      later($, () => startNew($))
      return { text: '새 모험을 연다냥! GM 미미짱 준비 중…' }
    }
    if (/^(이어|계속|continue|resume)/i.test(arg)) {
      const rest = arg.replace(/^\S+(\s+하기)?\s*/, '')
      const last = rest || String((await $.store.get('last')) ?? '')
      return { text: await resume($, last) }
    }
    if (/^(끝|그만|end|quit)/i.test(arg)) {
      const g = await read($, game)
      if (g) await persist($, g)
      await update($, game, () => null)
      await closePane($)
      return { text: g ? `「${g.name}」 저장하고 마쳤다냥. 또 놀자냥!` : 'TRPG 패널을 닫았다냥' }
    }
    return { text: await resume($, arg) }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) await update($, open, () => false)
    return next(e)
  })

  // 게임 중이면 주인님이 친 말에 지금 상태를 붙여 GM 이 잊지 않게 한다(패널 버튼으로 보낸 말은 tell 이 붙인다)
  on('prompt.submit', async ($, e, next) => {
    const kind = (e.origin as { kind: string } | undefined)?.kind
    if (kind !== 'composer' && kind !== 'bridge') return next(e)
    if (!(await read($, open))) return next(e)
    const g = await read($, game)
    if (!g) return next(e)
    const note = contextText(g)
    // 직접 쓴 행동이면 패널의 선택지는 지난 것, 이야기 탭에 주인님 말로 남긴다
    await commit($, addStory({ ...g, choices: [] }, 'player', e.text, await $.clock.now()))
    return next({ ...e, context: [...(e.context ?? []), note] })
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const raw = e as unknown as Record<string, unknown>
    const input = (raw.input !== null && typeof raw.input === 'object' ? raw.input : raw) as Record<string, unknown>
    const text = await steer($, input)
    return { result: text, text }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, open))) return next(e)
    const g = await read($, game)
    if (!g) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const pc = g.party.find(c => c.isPlayer) ?? g.party[0]
    const rolling = (await read($, tumble)) !== null
    return (
      <Box>
        <Text color={GOLD}>⚔ </Text>
        {pc ? <Text bold>{pc.name} </Text> : null}
        {pc ? <Text color={hpColor(pc.hp, pc.maxHp)}>HP {pc.hp}/{pc.maxHp} </Text> : null}
        <Text dimColor>· {g.scene.title || g.name} </Text>
        {g.ask && !rolling
          ? <Button key="band-roll" variant="primary" label={`굴리기: ${g.ask.move}`} onPress={() => later($, () => playerRoll($))} />
          : <Text dimColor>· {rolling ? '데굴데굴…' : '말하면 GM 미미짱이 받는다냥'} </Text>}
        <Button key="band-rest" label="쉬기" onPress={() => later($, () => closePane($))} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const width = Math.max(30, e.props.bodyColumns)
    const now = await $.clock.now()
    const g = await read($, game)
    const trouble = await read($, problem)
    const rule = (key: string) => <Text key={key} dimColor>{'─'.repeat(width)}</Text>
    const head = (title: string, color = BLUE, extra?: RenderElement | null) => (
      <Text><Text color={color} bold>▍{title}</Text>{extra ? <Text> </Text> : null}{extra ?? null}</Text>
    )
    const troubleLine = trouble
      ? <Button key="trouble" plain onPress={() => void update($, problem, () => '')}><Text color={RED}>{trouble} </Text><Text dimColor>(닫기)</Text></Button>
      : null

    // ── 시작 화면 ──
    if (!g) {
      const list = await read($, saves)
      const offered = await read($, lobby)
      return (
        <Box flexDirection="column" width={width}>
          <Text bold color={GOLD}>⚔ 미미짱의 던전</Text>
          <Text dimColor>2d6 판타지 던전 TRPG 다냥. GM 은 미미짱, 주인님은 모험가.</Text>
          {troubleLine}
          {offered.length
            ? <Box key="lobby" flexDirection="column" marginTop={1}>
                {head('골라 달라냥!', GOLD)}
                {offered.map((c, i) => (
                  <Box key={`choice-row-${i}`} paddingLeft={2}>
                    <Button key={`choice-${i}`} plain hotkey={String(i + 1)} onPress={() => later($, () => choose($, i))}><Text wrap="wrap">{c}</Text></Button>
                  </Box>
                ))}
                <Text dimColor>  직접 써도 된다냥</Text>
              </Box>
            : <Box key="start" marginTop={1}>
                <Button key="new" variant="primary" label="새 모험 시작" onPress={() => later($, () => startNew($))} />
              </Box>}
          <Box key="saves" flexDirection="column" marginTop={1}>
            {head('저장된 모험')}
            {list.length === 0 ? <Text dimColor>  아직 없다냥</Text> : null}
            {list.slice(0, 12).map(s => (
              <Button key={`load-${s.slug}`} plain onPress={() => later($, async () => void (await resume($, s.slug)))}>
                <Text>  {pad(s.name, Math.max(10, Math.floor(width * 0.4)))}</Text>
                <Text dimColor> {pad(s.summary, Math.max(6, width - Math.floor(width * 0.4) - 14))}</Text>
                <Text dimColor>{ago(s.updatedAt, now).padStart(7)}</Text>
              </Button>
            ))}
          </Box>
          <Box key="help" flexDirection="column" marginTop={1}>
            <Text dimColor>규칙: 2d6 + 능력치 → 10+ 강한 성공 · 7~9 약한 성공 · 6- 실패</Text>
            <Text dimColor>/trpg 이어 하기 · /trpg 끝 · /trpg 로 닫으면 쉬는 중</Text>
          </Box>
        </Box>
      )
    }

    const mapParts: RenderElement[] = []
    const actParts: RenderElement[] = []
    const sheetParts: RenderElement[] = []
    const rolling = await read($, tumble)
    const tab = await read($, view)
    const elements = $.ui.resolve(e)
    const Input = 'Input' in elements ? elements.Input : null
    const Markdown = 'Markdown' in elements ? elements.Markdown : null

    // ── 장면과 지도 ──
    const sc = g.scene
    const shownMap = sc.map.length ? renderMap(sc.map, sc.fog, sc.revealed, sc.at) : []
    const named = Object.entries(sc.rooms).filter(([label]) => !sc.fog || sc.revealed.includes(label) || label === sc.at)
    const legend = [
      ...(sc.at ? [`@ ${sc.rooms[sc.at] ?? sc.at}`] : []),
      ...(named.length <= 14 ? named.filter(([label]) => label !== sc.at).map(([label, name]) => `${label} ${name}`) : []),
    ]
    const asText = await read($, plainMap)
    const zoomPick = await read($, mapZoom)
    const forced = zoomPick >= 1 && zoomPick <= 5 ? (zoomPick as Zoom) : undefined
    const art = sc.mapRef && !asText ? paintMap(shownMap, sc.fog, sc.rooms, width - 2, forced, forced ? 44 : undefined, sc.glyphs) : null
    /** 일행 @ 만 눈에 띄게 */
    const paintAt = (line: string): RenderElement | string => {
      const i = line.indexOf('@')
      if (i < 0) return line
      return <Text>{line.slice(0, i)}<Text color={GOLD} bold>@</Text>{line.slice(i + 1)}</Text>
    }
    const foeName = Math.min(16, Math.max(8, ...g.scene.foes.map(f => cells(f.name))))
    const foes = g.scene.foes.map(f => (
      <Text key={`foe-${f.name}`} wrap="truncate-end">
        <Text color={f.hp === 0 ? undefined : RED} dimColor={f.hp === 0}>  {f.hp === 0 ? '✕' : '◆'} {pad(f.name, foeName)} </Text>
        <Text color={f.hp === 0 ? undefined : hpColor(f.hp, f.maxHp)} dimColor={f.hp === 0}>{bar(f.hp, f.maxHp, 8)} {`${f.hp}/${f.maxHp}`.padEnd(6)}</Text>
        <Text dimColor> 방어{f.armor} {f.damage}{f.hp === 0 ? ' 쓰러짐' : f.note ? ` ${f.note}` : ''}</Text>
      </Text>
    ))
    mapParts.push(
      <Box key="scene" flexDirection="column">
        {head('장면', BLUE, <Text bold>{g.scene.title || '아직 없음'}</Text>)}
        {g.scene.text ? <Box paddingLeft={2}><Text wrap="wrap">{g.scene.text}</Text></Box> : null}
        {g.scene.map.length
          ? <Box key="map" flexDirection="column" paddingLeft={2} marginTop={1}>
              {!shownMap.length
                ? <Text dimColor>(아직 드러난 곳이 없다냥)</Text>
                : art
                  ? art.rows.map((row, i) => (
                      <Text key={`map-${i}`} wrap="truncate-end">
                        {row.length ? row.map(p => <Text color={p.color} backgroundColor={p.bg} bold={p.bold} dimColor={p.dim}>{p.text}</Text>) : ' '}
                      </Text>
                    ))
                  : shownMap.map((line, i) => <Text key={`map-${i}`} color={MAP} wrap="truncate-end">{paintAt(line)}</Text>)}
              {legend.length ? <Text dimColor wrap="wrap">{legend.join(' · ')}</Text> : null}
              {sc.mapRef
                ? <Box key="map-tools" gap={1}>
                    {art ? <Button key="zoom-out" plain onPress={() => void update($, mapZoom, () => Math.max(1, art.zoom - 1))}><Text dimColor>[−]</Text></Button> : null}
                    {art ? <Text dimColor>{ZOOM_LABEL[art.zoom]}{zoomPick ? '' : ' 맞춤'}{art.cropped ? ' · 일행 둘레' : ''}</Text> : null}
                    {art ? <Button key="zoom-in" plain onPress={() => void update($, mapZoom, () => Math.min(5, art.zoom + 1))}><Text dimColor>[+]</Text></Button> : null}
                    {zoomPick ? <Button key="zoom-fit" plain onPress={() => void update($, mapZoom, () => 0)}><Text dimColor>[맞춤]</Text></Button> : null}
                    <Button key="map-style" plain onPress={() => void update($, plainMap, held => !held)}><Text dimColor>{asText ? '[선 그림]' : '[글자]'}</Text></Button>
                  </Box>
                : null}
            </Box>
          : <Text dimColor>  (지도가 없는 장면이다냥)</Text>}
        {foes}
      </Box>,
    )

    // ── 굴릴 차례 · 선택지 ──
    if (g.ask) {
      const who = g.party.find(c => c.name === g.ask?.who)
      const mod = (who && g.ask.stat ? who.stats[g.ask.stat] : 0) + g.ask.bonus + (who?.forward ?? 0)
      actParts.push(
        <Box key="ask" flexDirection="column" marginTop={1}>
          {head('굴릴 차례다냥!', GOLD)}
          <Text>  <Text bold>{g.ask.move}</Text><Text dimColor> · {g.ask.who}{g.ask.stat ? ` · ${STAT_LABEL[g.ask.stat]}` : ''}</Text></Text>
          {g.ask.why ? <Box paddingLeft={2}><Text dimColor wrap="wrap">{g.ask.why}</Text></Box> : null}
          <Box paddingLeft={2}>
            {rolling
              ? <Text color={GOLD}>데굴데굴…</Text>
              : <Button key="roll" variant="primary" hotkey="r" label={`주사위 굴리기 2d6${mod ? signed(mod) : ''}`} onPress={() => later($, () => playerRoll($))} />}
          </Box>
        </Box>,
      )
    } else if (g.choices.length) {
      actParts.push(
        <Box key="choices" flexDirection="column" marginTop={1}>
          {head('어떻게 할까냥?', GOLD)}
          {g.choices.map((c, i) => (
            <Box key={`choice-row-${i}`} paddingLeft={2}>
              <Button key={`choice-${i}`} plain hotkey={String(i + 1)} onPress={() => later($, () => choose($, i))}><Text wrap="wrap">{c}</Text></Button>
            </Box>
          ))}
        </Box>,
      )
    }

    // ── 시계 ──
    const shownClocks = g.clocks.filter(c => c.visible)
    const clockLines = shownClocks.map(c => (
      <Text key={`clock-${c.name}`} wrap="truncate-end">
        {'  '}<Text color={c.filled >= c.size ? RED : YELLOW}>{'●'.repeat(c.filled)}</Text><Text dimColor>{'○'.repeat(Math.max(0, c.size - c.filled))}</Text> {c.name}{c.note ? <Text dimColor> · {c.note}</Text> : null}
      </Text>
    ))
    if (shownClocks.length) sheetParts.push(<Box key="clocks" flexDirection="column" marginTop={1}>{head('시계', RED)}{clockLines}</Box>)

    // ── 주사위 ──
    const last = g.rolls[g.rolls.length - 1]
    let diceBlock: RenderElement | null = null
    if (last) {
      const spinning = rolling && rolling.rollId === last.id
      const values = spinning ? rolling.faces : last.groups.flatMap(gr => gr.values)
      const color = spinning ? GOLD : last.tier ? TIER_COLOR[last.tier] : BLUE
      const dice = values.length <= 4 ? diceArt(values) : null
      const sum = spinning ? '' : `  ${last.mod ? `${signed(last.mod)} ` : ''}= ${last.total}`
      const sides = last.groups.length === 1 && last.groups[0]?.sides !== 6 ? `d${last.groups[0]?.sides} ` : ''
      diceBlock = (
        <Box key="dice" flexDirection="column" marginTop={1}>
          {head('주사위', BLUE, <Text dimColor>{last.expr}</Text>)}
          {dice
            ? <Box flexDirection="column" paddingLeft={2}>
                <Text color={color}>{dice[0]}</Text>
                <Text><Text color={color}>{dice[1]}</Text><Text bold>{sum}</Text></Text>
                <Text color={color}>{dice[2]}</Text>
              </Box>
            : <Text>  <Text color={color}>{sides}{values.map(v => `[${v}]`).join('')}</Text><Text bold>{sum}</Text></Text>}
          {spinning
            ? <Text color={GOLD}>  데굴데굴…</Text>
            : <Box flexDirection="column" paddingLeft={2}>
                {last.tier ? <Text color={TIER_COLOR[last.tier]} bold>{TIER_SHOUT[last.tier]}</Text> : null}
                <Text dimColor wrap="truncate-end">{last.who ? `${last.who} · ` : ''}{last.what}{last.stat ? ` (${STAT_LABEL[last.stat]})` : ''}{last.by === 'player' ? ' · 주인님이 굴림' : ''}</Text>
                {last.target ? <Text color={RED}>→ {last.target} HP -{last.dealt ?? 0}</Text> : null}
              </Box>}
        </Box>
      )
      sheetParts.push(
        <Box key="dice-history" flexDirection="column" marginTop={1}>
          {head('최근 굴림', BLUE)}
          {g.rolls.slice(-6).reverse().map(r => (
            <Text key={`roll-${r.id}`} dimColor wrap="truncate-end">
              {'  · '}{String(r.total).padStart(3)} <Text color={r.tier ? TIER_COLOR[r.tier] : undefined}>{pad(r.tier ? TIER_LABEL[r.tier] : r.target ? `피해 ${r.dealt ?? 0}` : r.expr, 9)}</Text> {r.what}{r.who ? ` · ${r.who}` : ''} <Text dimColor>{ago(r.at, now)}</Text>
            </Text>
          ))}
        </Box>,
      )
    }

    // ── 캐릭터 탭: 상태 · 능력치 · 소지품 · 기술 ──
    const STAT_USE: Record<string, string> = { str: '베고 찌르기 · 힘으로 버티기', dex: '쏘기 · 피하기', con: '버티기 · 견디기', int: '떠올리기 · 마법사 주문', wis: '살피기 · 성직자 주문', cha: '설득하기 · 노래' }
    const charParts: RenderElement[] = []
    const sheet = (c: Character) => {
      const need = xpNeeded(c)
      const hpWidth = Math.max(8, Math.min(24, width - 24))
      const spells = c.moves.filter(m => m.startsWith('받은 주문') || m.startsWith('기도(소마법)'))
      const extras = c.moves.filter(m => m.startsWith('배경') || m.startsWith('유대'))
      const moves = c.moves.filter(m => !spells.includes(m) && !extras.includes(m))
      const section = (id: string, title: string) => <Box key={`${id}-${c.name}`} marginTop={1}>{head(title, BLUE)}</Box>
      return (
        <Box key={`pc-${c.name}`} flexDirection="column" marginTop={1}>
          <Box justifyContent="space-between">
            <Text><Text color={GOLD} bold>{c.name}</Text>  {c.role} <Text dimColor>Lv{c.level}</Text></Text>
            <Text dimColor>{c.isPlayer ? '주인님' : '동료'}</Text>
          </Box>
          {c.look ? <Box paddingLeft={2}><Text dimColor wrap="wrap">{c.look}</Text></Box> : null}
          {section('st', '상태')}
          <Text>  HP  <Text color={hpColor(c.hp, c.maxHp)}>{bar(c.hp, c.maxHp, hpWidth)}</Text> <Text bold>{c.hp}/{c.maxHp}</Text></Text>
          <Text>  XP  <Text color={PURPLE}>{'●'.repeat(Math.min(c.xp, need))}{'○'.repeat(Math.max(0, need - c.xp))}</Text> <Text dimColor>{c.xp}/{need}</Text>{c.xp >= need ? <Text color={PURPLE} bold>  레벨 업!(쉴 때)</Text> : null}</Text>
          <Text>  방어 <Text bold>{c.armor}</Text><Text dimColor>   피해 </Text><Text bold>{c.damage}</Text><Text dimColor>   금화 </Text><Text color={GOLD} bold>{c.gold}</Text></Text>
          <Text wrap="wrap">  상태 {c.conditions.length || c.forward
            ? <Text color={YELLOW}>{[...c.conditions, ...(c.forward ? [`다음 굴림 ${signed(c.forward)}`] : [])].join(' · ')}</Text>
            : <Text dimColor>멀쩡함</Text>}</Text>
          {section('ab', '능력치')}
          {STATS.map(s => (
            <Text key={`ab-${c.name}-${s}`} wrap="truncate-end">
              {'  '}{pad(STAT_LABEL[s], 4)} <Text bold color={c.stats[s] > 0 ? GREEN : c.stats[s] < 0 ? RED : undefined}>{signed(c.stats[s]).padStart(2)}</Text>  <Text dimColor>{STAT_USE[s]}</Text>
            </Text>
          ))}
          {section('it', `소지품 ${c.items.length}`)}
          {c.items.length
            ? c.items.map((it, i) => (
                <Text key={`it-${c.name}-${i}`} wrap="wrap">  · {it.name}{it.qty > 1 ? <Text color={GOLD}> ×{it.qty}</Text> : null}{it.note ? <Text dimColor>  {it.note}</Text> : null}</Text>
              ))
            : <Text dimColor>  비었다</Text>}
          {moves.length ? section('mv', '기술') : null}
          {moves.map((m, i) => <Box key={`mv-${c.name}-${i}`} paddingLeft={2}><Text wrap="wrap">· {m}</Text></Box>)}
          {spells.length ? section('sp', '주문') : null}
          {spells.map((m, i) => <Box key={`sp-${c.name}-${i}`} paddingLeft={2}><Text wrap="wrap">· {m}</Text></Box>)}
          {extras.length ? section('ex', '배경 · 유대') : null}
          {extras.map((m, i) => <Box key={`ex-${c.name}-${i}`} paddingLeft={2}><Text dimColor wrap="wrap">· {m}</Text></Box>)}
        </Box>
      )
    }
    const party = [...g.party].sort((a, b) => Number(b.isPlayer) - Number(a.isPlayer))
    if (party.length) charParts.push(...party.map(sheet))
    else charParts.push(<Text key="no-pc" dimColor>  아직 캐릭터가 없다냥: 이야기 탭에서 GM 과 함께 만든다</Text>)

    // ── 퀘스트 ──
    if (g.quests.length) {
      sheetParts.push(
        <Box key="quests" flexDirection="column" marginTop={1}>
          {head('퀘스트')}
          {[...g.quests].sort((a, b) => Number(a.status !== 'active') - Number(b.status !== 'active')).map(q => (
            <Box key={`q-${q.title}`} paddingLeft={2}>
              <Text wrap="wrap" dimColor={q.status !== 'active'}>
                <Text color={q.status === 'done' ? GREEN : q.status === 'failed' ? RED : GOLD}>{q.status === 'done' ? '✓' : q.status === 'failed' ? '✕' : '◆'} </Text>
                {q.title}{q.note && q.status === 'active' ? <Text dimColor> — {q.note}</Text> : null}
              </Text>
            </Box>
          ))}
        </Box>,
      )
    }

    // ── 기록 ──
    const logOpen = await read($, showLog)
    const stories = g.log.filter(l => l.kind !== 'roll')
    if (stories.length) {
      sheetParts.push(
        <Box key="log" flexDirection="column" marginTop={1}>
          <Button key="log-toggle" plain onPress={() => void update($, showLog, held => !held)}>
            <Text color={BLUE} bold>{logOpen ? '▾' : '▸'} 기록</Text><Text dimColor> {stories.length}</Text>
          </Button>
          {logOpen
            ? stories.slice(-10).map((l, i) => (
                <Box key={`log-${i}`} paddingLeft={2}><Text dimColor wrap="wrap">{clock(l.at)} {l.text}</Text></Box>
              ))
            : null}
        </Box>,
      )
    }

    // ── 수첩 탭: 만난 사람 · 알게 된 것 ──
    const noteParts: RenderElement[] = []
    noteParts.push(<Box key="nb-people" marginTop={1}>{head(`만난 사람 ${g.people.length}`, GOLD)}</Box>)
    if (!g.people.length) noteParts.push(<Text key="nb-none" dimColor>  아직 이름을 아는 사람이 없다</Text>)
    g.people.forEach((p, i) => noteParts.push(
      <Box key={`nb-p-${i}`} flexDirection="column" marginTop={1} paddingLeft={2}>
        <Text wrap="wrap"><Text bold>{p.name}</Text>{p.who ? <Text>  {p.who}</Text> : null}<Text dimColor>  · {p.met}</Text></Text>
        {p.notes.map((n, k) => <Box key={`nb-p-${i}-${k}`} paddingLeft={2}><Text dimColor wrap="wrap">- {n}</Text></Box>)}
      </Box>,
    ))
    noteParts.push(<Box key="nb-facts" marginTop={1}>{head(`알게 된 것 ${g.facts.length}`, BLUE)}</Box>)
    if (!g.facts.length) noteParts.push(<Text key="nb-f-none" dimColor>  아직 없다</Text>)
    g.facts.forEach((f, i) => noteParts.push(
      <Box key={`nb-f-${i}`} paddingLeft={2}><Text wrap="wrap">· {f.text}{f.source ? <Text dimColor>  ({f.source} · {f.day}일째)</Text> : <Text dimColor>  ({f.day}일째)</Text>}</Text></Box>,
    ))

    // ── 기록 탭: 지난 이야기 전부 ──
    if (g.story.length) {
      sheetParts.push(<Box key="story-all" marginTop={1}>{head(`지난 이야기 ${g.story.length}`, BLUE)}</Box>)
      g.story.forEach((line, i) => sheetParts.push(
        <Box key={`old-${i}`} paddingLeft={1} marginTop={line.who === 'gm' ? 1 : 0}>
          {line.who === 'gm' && Markdown ? <Markdown key={`old-md-${i}`} text={line.text} dimColor /> : <Text color={line.who === 'gm' ? undefined : GOLD} dimColor={line.who === 'gm'} wrap="wrap">{line.who === 'gm' ? line.text : `▶ ${line.text}`}</Text>}
        </Box>,
      ))
    }

    // ── 이야기 탭: 최근 서술 · 행동, 굴림 · 선택지 · 입력칸 ──
    const storyParts: RenderElement[] = []
    const pc = party[0]
    storyParts.push(
      <Text key="where" wrap="truncate-end">
        <Text color={BLUE} bold>▍{g.scene.title || '이야기'}</Text>
        {pc ? <Text dimColor>   {pc.name} </Text> : null}
        {pc ? <Text color={hpColor(pc.hp, pc.maxHp)}>HP {pc.hp}/{pc.maxHp}</Text> : null}
        {shownClocks.length ? <Text dimColor>   {shownClocks.map(c => `${c.name} ${c.filled}/${c.size}`).join(' · ')}</Text> : null}
      </Text>,
    )
    // 화면에 들어갈 만큼만 최근 것부터(나머지는 위로 밀린다)
    const rowsFree = Math.max(8, (e.props.scroll?.bodyRows ?? 40) - 12 - (actParts.length ? (g.choices.length || 4) + 2 : 0))
    const textRows = (t: string) => t.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(cells(line) / Math.max(10, width - 4))), 0) + 1
    const feed: typeof g.story = []
    let used = 0
    for (let i = g.story.length - 1; i >= 0; i--) {
      const line = g.story[i]!
      const r = textRows(line.text)
      if (feed.length && used + r > rowsFree) break
      feed.unshift(line)
      used += r
    }
    if (g.story.length > feed.length) storyParts.push(<Text key="older" dimColor>  … 앞 이야기 {g.story.length - feed.length}덩이(기록 탭)</Text>)
    if (!feed.length) storyParts.push(<Box key="empty" marginTop={1} paddingLeft={2}><Text dimColor>GM 미미짱의 이야기가 여기 쓰인다냥.</Text></Box>)
    feed.forEach((line, i) => storyParts.push(
      line.who === 'gm'
        ? <Box key={`story-${i}`} marginTop={1} paddingLeft={1}>{Markdown ? <Markdown key={`md-${i}`} text={line.text} /> : <Text wrap="wrap">{line.text}</Text>}</Box>
        : <Box key={`story-${i}`} marginTop={1} paddingLeft={1}><Text color={GOLD} wrap="wrap">▶ {line.text}</Text></Box>,
    ))
    // 굴린 결과가 아직 서술되지 않았으면 주사위를 보여 준다
    const lastGm = [...g.story].reverse().find(l => l.who === 'gm')
    if (diceBlock && last && (rolling || !lastGm || last.at > lastGm.at)) storyParts.push(diceBlock)
    if (g.scene.foes.some(f => f.hp > 0)) storyParts.push(<Box key="story-foes" flexDirection="column" marginTop={1}>{foes}</Box>)
    storyParts.push(...actParts)
    const typed = await read($, draft)
    if (Input) {
      storyParts.push(
        <Box key="say" marginTop={1}>
          <Input key="say-input" autoFocus placeholder={g.ask ? '굴리기 버튼을 누르거나, 하고 싶은 걸 써 달라냥' : '무엇을 할까냥? (쓰고 Enter)'} value={typed} submitLabel="말하기"
            onInput={(value: string) => void update($, draft, () => value)}
            onSubmit={(value: string) => later($, async () => {
              const t = value.trim()
              await update($, draft, () => '')
              if (t) await tell($, t)
            })} />
        </Box>,
      )
    }

    const saved = await read($, savedAt)
    const tabs: [string, string, string][] = [['story', '이야기', 'e'], ['char', '캐릭터', 'c'], ['note', '수첩', 'n'], ['map', '지도', 'm'], ['sheet', '기록', 'l']]
    return (
      <Box flexDirection="column" width={width}>
        <Box key="head" justifyContent="space-between">
          <Text bold color={GOLD}>⚔ {g.name}</Text>
          <Text><Text color={PURPLE}>{timeText(g.time)}</Text><Text dimColor>{saved ? ` · ${clock(saved)} 저장` : ''}</Text></Text>
        </Box>
        <Box key="tabs" gap={1}>
          {tabs.map(([id, name]) => (
            <Button key={`tab-${id}`} plain onPress={() => void update($, view, () => id)}>
              {tab === id ? <Text bold color={BLUE}>[{name}]</Text> : <Text dimColor> {name} </Text>}
            </Button>
          ))}
          {g.ask && tab !== 'story' ? <Text color={GOLD}> · 굴릴 차례!</Text> : null}
        </Box>
        {troubleLine}
        {rule('rule-head')}
        {tab === 'map' ? mapParts : tab === 'sheet' ? sheetParts : tab === 'char' ? charParts : tab === 'note' ? noteParts : storyParts}
      </Box>
    )
  })
}
