import { expect, mock, test } from 'claude-code/testing'

import type { Campaign } from '../types'
import { apply, cells, contextText, newCampaign, normalize, pad, parseDice, rollDice, slugOf, statusText, tierOf } from '../hooks/game'

/** 정해 둔 눈이 차례로 나오는 주사위: d6 에서 n 이 나오게 (n-1)/6 */
function fixed(...faces: number[]) {
  let i = 0
  return () => ((faces[i++ % faces.length] ?? 1) - 0.5) / 6
}

function ok(out: ReturnType<typeof apply>): { game: Campaign; text: string } {
  if ('error' in out) throw new Error(out.error)
  return out
}

test('주사위 식: 읽기 · 틀린 식 · 굴리기', async () => {
  expect(parseDice('2d6+1')).toEqual({ dice: [{ count: 2, sides: 6 }], mod: 1 })
  expect(parseDice('d8 + d4 - 1')).toEqual({ dice: [{ count: 1, sides: 8 }, { count: 1, sides: 4 }], mod: -1 })
  expect(typeof parseDice('주먹')).toBe('string')
  expect(typeof parseDice('-d4')).toBe('string')
  expect(typeof parseDice('40d6')).toBe('string')
  expect(typeof parseDice('3')).toBe('string') // 주사위가 없다
  const r = rollDice('2d6+1', fixed(3, 5))
  expect(typeof r === 'string' ? r : r.total).toBe(9)
  expect(tierOf(10)).toBe('strong')
  expect(tierOf(7)).toBe('weak')
  expect(tierOf(6)).toBe('miss')
})

test('판정 흐름: 캐릭터 → 굴림 요청 → 실패면 XP → 피해 → 소지품', async () => {
  let g = newCampaign('잿빛 탑의 저주', '탑의 저주를 푼다', 1000)
  expect(g.slug).toBe('잿빛-탑의-저주')
  g = ok(apply(g, 'character', { name: '카엘', role: '전사', maxHp: 18, armor: 1, damage: 'd10', stats: { str: 2, dex: 1, 지능: -1 }, items: ['횃불×3', '식량×5', { name: '장검' }] }, 1001, fixed(1))).game
  const kael = g.party[0]
  expect(kael?.isPlayer).toBe(true) // 첫 캐릭터는 주인님 것
  expect(kael?.hp).toBe(18)
  expect(kael?.stats.int).toBe(-1)
  expect(kael?.items.map(i => `${i.name}${i.qty}`)).toEqual(['횃불3', '식량5', '장검1'])

  g = ok(apply(g, 'ask', { move: '위험에 맞서기', stat: 'dex', why: '무너지는 다리' }, 1002, fixed(1))).game
  expect(g.ask?.who).toBe('카엘')
  g = ok(apply(g, 'choices', { options: ['뛴다', '돌아간다'] }, 1003, fixed(1))).game
  // 인자 없이 굴리면 대기 중인 요청대로: 1+2+민첩1 = 4 → 실패, XP +1
  const rolled = ok(apply(g, 'roll', {}, 1004, fixed(1, 2), 'player'))
  g = rolled.game
  expect(g.rolls[0]?.total).toBe(4)
  expect(g.rolls[0]?.tier).toBe('miss')
  expect(g.rolls[0]?.by).toBe('player')
  expect(g.ask).toBe(null)
  expect(g.choices).toEqual([])
  expect(g.party[0]?.xp).toBe(1)
  expect(rolled.text).toContain('XP +1')

  // 다음 굴림 +1 은 한 번 쓰고 사라진다: 5+5+힘2+1 = 13
  g = ok(apply(g, 'change', { forward: 1 }, 1005, fixed(1))).game
  g = ok(apply(g, 'roll', { move: '베고 찌르기', stat: '힘' }, 1006, fixed(5, 5))).game
  expect(g.rolls[1]?.total).toBe(13)
  expect(g.party[0]?.forward).toBe(0)

  // 적 피해는 방어만큼 덜 깎인다: d10 → 6, 방어 1 → 5
  g = ok(apply(g, 'foe', { name: '고블린 궁수', maxHp: 6, armor: 1, damage: 'd6' }, 1007, fixed(1))).game
  const hit = ok(apply(g, 'dice', { expr: 'd10', target: '고블린', why: '장검' }, 1008, () => 0.55))
  g = hit.game
  expect(g.scene.foes[0]?.hp).toBe(1)
  expect(hit.text).toContain('방어 1 막음')
  g = ok(apply(g, 'change', { who: '고블린 궁수', hp: -3 }, 1009, fixed(1))).game
  expect(g.scene.foes[0]?.hp).toBe(0)

  g = ok(apply(g, 'change', { removeItems: ['횃불×1', '식량'], addItems: ['은화 주머니'], gold: 12 }, 1010, fixed(1))).game
  expect(g.party[0]?.items.map(i => `${i.name}${i.qty}`)).toEqual(['횃불2', '장검1', '은화 주머니1'])
  expect(g.party[0]?.gold).toBe(12)
  const down = ok(apply(g, 'change', { hp: -99 }, 1011, fixed(1)))
  expect(down.game.party[0]?.hp).toBe(0)
  expect(down.text).toContain('마지막 숨')

  // 장면이 바뀌면 적과 지도는 새로
  g = ok(apply(g, 'scene', { title: '납골당', text: '촛불이 흔들린다', map: '###\n#@#\n###' }, 1012, fixed(1))).game
  expect(g.scene.foes).toEqual([])
  expect(g.scene.map).toEqual(['###', '#@#', '###'])
  g = ok(apply(g, 'quest', { title: '탑의 저주를 풀어라' }, 1013, fixed(1))).game
  g = ok(apply(g, 'quest', { title: '탑의 저주', status: 'done' }, 1014, fixed(1))).game
  expect(g.quests).toEqual([{ title: '탑의 저주를 풀어라', status: 'done', note: '' }])
  g = ok(apply(g, 'secret', { text: '탑 꼭대기의 마법사가 흑막' }, 1015, fixed(1))).game

  expect('error' in apply(g, 'roll', { stat: '용기' }, 1016, fixed(1))).toBe(true)
  expect('error' in apply(g, 'change', { who: '없는 사람', hp: 1 }, 1016, fixed(1))).toBe(true)
  expect('error' in apply(g, 'dance', {}, 1016, fixed(1))).toBe(true)

  // 저장 파일로 갔다 와도 그대로
  expect(normalize(JSON.parse(JSON.stringify(g)), 0)).toEqual(g)
  expect(contextText(g)).toContain('카엘(전사 Lv1, 주인님)')
  expect(contextText(g)).toContain('흑막')
  expect(statusText(g, 2000)).toContain('## GM 비밀 메모')
})

test('도우미: 칸 수 · 파일 이름', async () => {
  expect(cells('카엘 d10')).toBe(8)
  expect(pad('고블린 주술사', 8)).toBe('고블린 …')
  expect(slugOf('a/b: c?')).toBe('ab-c')
  expect(slugOf('  ')).toBe('campaign')
})

// ── 패널: 가짜 파일 · 화면으로 열고 굴리고 고른다 ──────────────────────

const HOME = '/home/test'
const DIR = `${HOME}/.local/share/clawd-deck/trpg`
const PANE = { title: 'TRPG', isFocused: false, bodyColumns: 58, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} } as const

test('패널: 새 캠페인을 저장하고, 굴리기 · 선택지 버튼이 GM 에게 말을 보낸다', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-16T21:00:00+09:00') })
  mock.store(on)
  mock.env(on, { HOME })
  const session = mock.session(on)
  const files = new Map<string, string>()
  on('fs.write', ($, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.exists', ($, e) => ({ value: files.has(e.path) || [...files.keys()].some(k => k.startsWith(`${e.path}/`)) }))
  on('fs.list', ($, e) => ({
    value: [...files.keys()].filter(k => k.startsWith(`${e.path}/`)).map(k => ({ name: k.slice(e.path.length + 1), kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })),
  }))
  on('fs.read', ($, e) => ({ value: files.get(e.path) ?? '' }))
  let isOpen = false
  on('ui.open', () => {
    isOpen = true
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => {
    isOpen = false
    return { value: undefined }
  })
  const sent: { text: string; context: readonly string[] }[] = []
  on('prompt.submit', ($, e) => {
    sent.push({ text: e.text, context: e.context ?? [] })
    return { text: e.text }
  })

  const call = (input: Record<string, unknown>) => $.tool.call({ tool: 'mcp__clawd-trpg__trpg_panel', ...input })
  // 캠페인을 만들기 전 선택지는 시작 화면에
  expect((await call({ action: 'choices', options: ['잿빛 탑', '광산 마을'] })).text).toContain('시작 화면')
  const lobbyUi = await $.ui.mount({ plugin: 'clawd-trpg', surface: 'terminal', component: 'Pane', requestId: 'trpg', props: PANE })
  await lobbyUi.press({ key: 'choice-0' })
  await clock.settle()
  expect(sent.shift()?.text).toBe('▶ 잿빛 탑')
  expect(await lobbyUi.find({ key: 'new' })).toBeDefined() // 고르면 선택지는 사라진다
  await lobbyUi.unmount()
  const made = await call({ action: 'new', campaign: '잿빛 탑의 저주', premise: '탑의 저주' })
  expect(made.text).toContain('새 캠페인')
  expect(isOpen).toBe(true)
  await call({ action: 'character', name: '카엘', role: '전사', maxHp: 18, stats: { dex: 1 } })
  await call({ action: 'scene', title: '무너진 다리', foes: [{ name: '고블린', hp: 4 }] })
  await call({ action: 'ask', move: '위험에 맞서기', stat: 'dex', why: '다리가 무너진다' })
  const saved = JSON.parse(files.get(`${DIR}/잿빛-탑의-저주.json`) ?? '{}') as Campaign
  expect(saved.party[0]?.name).toBe('카엘')
  expect(saved.ask?.move).toBe('위험에 맞서기')
  expect((await call({ action: 'dance' })).text).toContain('안 됐다')

  const ui = await $.ui.mount({ plugin: 'clawd-trpg', surface: 'terminal', component: 'Pane', requestId: 'trpg', props: PANE })
  expect(await ui.find({ type: 'Text', text: /무너진 다리/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /고블린/ })).toBeDefined()
  await ui.press({ key: 'roll' })
  await clock.advance(2000)
  expect(sent.length).toBe(1)
  expect(sent[0]?.text).toContain('주인님이 굴렸다냥')
  expect(sent[0]?.text).toContain('위험에 맞서기')
  // 게임 중이면 보내기 전에 지금 상태를 숨은 메모로 붙인다
  expect(JSON.stringify(session.appended().at(-1)?.message.content)).toContain('[clawd-trpg]')
  expect(await ui.find({ key: 'roll' })).toBeUndefined() // 굴리고 나면 버튼은 사라진다
  expect(await ui.find({ type: 'Text', text: /╭───╮ ╭───╮/ })).toBeDefined()

  await call({ action: 'choices', options: ['고블린을 벤다', '다리 아래를 살핀다'] })
  await ui.press({ key: 'choice-1' })
  await clock.settle()
  expect(sent[1]?.text).toBe('▶ 다리 아래를 살핀다')
  expect(await ui.find({ key: 'choice-0' })).toBeUndefined()

  const status = await call({ action: 'status' })
  expect(status.text).toContain('주인님이 굴림')
  const ended = await call({ action: 'end' })
  expect(ended.text).toContain('저장하고 내렸다')
  expect(isOpen).toBe(false)
  await ui.unmount()

  // 시작 화면: 저장된 모험이 보이고, 누르면 이어 한다
  const listed = await call({ action: 'list' })
  expect(listed.text).toContain('잿빛 탑의 저주')
  const start = await $.ui.mount({ plugin: 'clawd-trpg', surface: 'terminal', component: 'Pane', requestId: 'trpg', props: PANE })
  expect(await start.find({ key: 'new' })).toBeDefined()
  await start.press({ key: 'load-잿빛-탑의-저주' })
  await clock.settle()
  expect(sent[2]?.text).toContain('이어서 하자냥')
  expect(isOpen).toBe(true)
  expect(await start.find({ type: 'Text', text: /무너진 다리/ })).toBeDefined()
  await start.unmount()
})
