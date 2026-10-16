import { expect, mock, test } from 'claude-code/testing'

import type { Campaign } from '../types'
import { apply, newCampaign } from '../hooks/game'
import type { WorldFile } from '../hooks/world'
import { indexText, labelsOf, loreText, mapOf, renderMap, searchText } from '../hooks/world'

const TOWER = `# 잿빛 탑 {#top}

오르벤의 탑이다.

## 1층 · 현관과 서재 {#f1}

먼지 냄새.

\`\`\`map
#########
#1..#.2.#
#...+...#
##+###%##
 #a.....#
 ###+####
   #3*#
   ####
\`\`\`

### 1. 현관 {#f1-1}
> 문이 삐걱 열린다.

### 2. 서재 {#f1-2}
종이 박쥐가 산다(→ bestiary#paper-bat).

### 3. 창고 {#f1-3}
모래시계가 있다.

## 바깥 {#outside}

\`\`\`map nofog
^^^TT
.A..B
\`\`\`

A = 버들목 (→ burdmok#top)
B = 잿빛 탑

## 예시 {#sample}

~~~~
## 가짜 제목 {#f1}
~~~~
`

const FILES: WorldFile[] = [
  { id: 'ashtower', path: 'atlas/ashtower.md', text: TOWER },
  { id: 'bible', path: 'bible.md', text: '# 잿빛 변경 — 세계관 바이블 {#top}\n\n## 별 {#star}\n검은 별 노크투르.\n' },
]

function ok(out: ReturnType<typeof apply>): Campaign {
  if ('error' in out) throw new Error(out.error)
  return out.game
}

test('세계 문서: 목차 · 구역 · 찾기', async () => {
  expect(indexText(FILES)).toContain('- ashtower — 잿빛 탑')
  const top = loreText(FILES, 'ashtower')
  expect(top).toContain('오르벤의 탑이다')
  expect(top).toContain('- 1층 · 현관과 서재 → ashtower#f1')
  expect(top).toContain('  - 2. 서재 → ashtower#f1-2')
  const room = loreText(FILES, 'ashtower#f1-2')
  expect(room.startsWith('### 2. 서재')).toBe(true)
  expect(room).not.toContain('창고') // 다음 방 전까지
  expect(loreText(FILES, 'ashtower#nope')).toContain('없다')
  expect(loreText(FILES, 'nope')).toContain('있는 것: ashtower, bible')
  expect(searchText(FILES, '종이 박쥐')).toContain('ashtower#f1-2')
  expect(searchText(FILES, '노크투르')).toContain('bible#star')
})

test('지도: 꺼내기 · 안개 · 숨은 문 · 펼친 지도', async () => {
  const m = mapOf(FILES, 'ashtower#f1-2')
  if (typeof m === 'string') throw new Error(m)
  expect(m.ref).toBe('ashtower#f1')
  expect(m.at).toBe('2') // 방을 가리키면 일행은 그 방
  expect(m.fog).toBe(true)
  expect(m.rooms).toEqual({ 1: '현관', 2: '서재', 3: '창고' })
  expect(labelsOf(m.lines).sort()).toEqual(['1', '2', '3', 'a'])
  // 현관만: 서재 쪽 문은 보이지만 서재는 안 보인다
  expect(renderMap(m.lines, true, ['1'], '1')).toEqual(['#####', '#@..#', '#...+', '##+##'])
  // 현관 · 통로: 통로 표지는 바닥으로, 숨은 문은 한쪽만 알면 벽
  const two = renderMap(m.lines, true, ['1', 'a'], 'a')
  expect(two.join('\n')).not.toContain('a')
  expect(two[3]).toBe('##+######')
  // 서재까지 알면 숨은 문이 문으로
  expect(renderMap(m.lines, true, ['1', 'a', '2'], '1')[3]).toBe('##+###+##')
  const out = mapOf(FILES, 'ashtower#outside')
  if (typeof out === 'string') throw new Error(out)
  expect(out.fog).toBe(false)
  expect(out.rooms).toEqual({ A: '버들목', B: '잿빛 탑' })
  expect(renderMap(out.lines, false, [], 'B')).toEqual(['^^^TT', '.A..@'])
  expect(typeof mapOf(FILES, 'ashtower#top')).toBe('string') // 지도 없는 구역
  expect(typeof mapOf(FILES, 'ashtower#sample')).toBe('string') // ~~~~ 안은 읽지 않는다
})

test('장면: 세계 지도를 띄우고 방을 하나씩 드러낸다', async () => {
  const m = mapOf(FILES, 'ashtower#f1')
  if (typeof m === 'string') throw new Error(m)
  let g = newCampaign('잿빛 탑의 저주', '', 0)
  g = ok(apply(g, 'scene', { title: '잿빛 탑 1층', world: m, reveal: ['1'], at: '1' }, 1, Math.random))
  expect(g.scene.mapRef).toBe('ashtower#f1')
  expect(g.scene.revealed).toEqual(['1'])
  g = ok(apply(g, 'scene', { reveal: ['a'], at: '2' }, 2, Math.random))
  expect(g.scene.revealed).toEqual(['1', 'a', '2'])
  expect(g.scene.title).toBe('잿빛 탑 1층') // 제목을 안 주면 같은 장면
  const bad = apply(g, 'scene', { reveal: ['9'] }, 3, Math.random)
  expect('error' in bad && bad.error).toContain('없는 표지: 9')
  // 손으로 그린 지도는 안개 없이
  g = ok(apply(g, 'scene', { title: '광장', map: '..@..' }, 4, Math.random))
  expect(g.scene.fog).toBe(false)
  expect(g.scene.mapRef).toBe('')
})

test('시계와 시간', async () => {
  let g = newCampaign('x', '', 0)
  g = ok(apply(g, 'clock', { name: '미라가 굳기까지', size: 6, tick: 2 }, 1, Math.random))
  g = ok(apply(g, 'clock', { name: '상회의 수확', size: 6, visible: false }, 1, Math.random))
  const full = apply(g, 'clock', { name: '미라', tick: 9 }, 1, Math.random)
  expect('text' in full && full.text).toContain('다 찼다')
  g = ok(full)
  expect(g.clocks.map(c => [c.name, c.filled, c.visible])).toEqual([['미라가 굳기까지', 6, true], ['상회의 수확', 0, false]])
  expect(g.time).toEqual({ day: 1, part: 1 })
  const night = apply(g, 'time', { advance: 4 }, 2, Math.random)
  expect('text' in night && night.text).toContain('1일째 아침 → 2일째 새벽')
  g = ok(night)
  g = ok(apply(g, 'time', { part: '해 질 녘' }, 3, Math.random))
  expect(g.time).toEqual({ day: 2, part: 3 })
  expect('error' in apply(g, 'time', { part: '점심' }, 4, Math.random)).toBe(true)
})

test('패널: lore 로 세계 문서를 읽고 지도를 띄운다', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.store(on)
  mock.env(on, { HOME: '/home/test' })
  mock.session(on)
  const files = new Map<string, string>()
  on('fs.write', ($, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  const isWorld = (path: string) => path.includes('/world')
  on('fs.exists', ($, e) => ({ value: isWorld(e.path) || files.has(e.path) || [...files.keys()].some(k => k.startsWith(`${e.path}/`)) }))
  on('fs.list', ($, e) => {
    if (e.path.endsWith('/world')) {
      return { value: [
        { name: 'atlas', kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false },
        { name: 'bible.md', kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false },
      ] }
    }
    if (e.path.endsWith('/world/atlas')) return { value: [{ name: 'ashtower.md', kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false }] }
    return { value: [] }
  })
  on('fs.read', ($, e) => ({ value: e.path.endsWith('ashtower.md') ? TOWER : e.path.endsWith('bible.md') ? (FILES[1]?.text ?? '') : files.get(e.path) ?? '' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  const sent: string[] = []
  on('prompt.submit', ($, e) => {
    sent.push(e.text)
    return { text: e.text }
  })

  const call = (input: Record<string, unknown>) => $.tool.call({ tool: 'mcp__clawd-trpg__trpg_panel', ...input })
  expect((await call({ action: 'lore' })).text).toContain('ashtower — 잿빛 탑')
  expect((await call({ action: 'lore', ref: 'ashtower#f1-1' })).text).toContain('문이 삐걱')
  await call({ action: 'new', campaign: '탑' })
  const shown = await call({ action: 'scene', title: '탑 1층', map: 'ashtower#f1-1' })
  expect(shown.text).toContain('일행 @ 1 현관')
  await call({ action: 'clock', name: '미라가 굳기까지', size: 6, tick: 1 })
  await call({ action: 'time', advance: 2 })

  const ui = await $.ui.mount({
    plugin: 'clawd-trpg', surface: 'terminal', component: 'Pane', requestId: 'trpg',
    props: { title: 'TRPG', isFocused: false, bodyColumns: 58, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
  })
  // 이야기 탭: GM 서술이 마크다운으로, 입력칸에 쓰면 GM 에게 간다
  await call({ action: 'narrate', text: '**버들목**에 해가 진다냥.' })
  expect(await ui.find({ type: 'Markdown', text: /버들목/ })).toBeDefined()
  await ui.input({ key: 'say-input', text: '광장으로 간다' })
  await clock.settle()
  expect(sent.at(-1)).toBe('광장으로 간다')
  expect((await call({ action: 'status' })).text).toBeDefined()
  await ui.press({ key: 'tab-map' })
  expect(await ui.find({ type: 'Text', text: / @ / })).toBeDefined() // 픽셀 지도의 일행 표시
  await ui.press({ key: 'map-style' })
  expect(await ui.find({ type: 'Text', text: /#####/ })).toBeDefined() // 글자 지도로 바꿀 수 있다
  await ui.press({ key: 'map-style' })
  expect(await ui.find({ type: 'Text', text: /@ 현관/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /서재/ })).toBeUndefined() // 아직 안 드러난 방 이름은 안 보인다
  expect(await ui.find({ type: 'Text', text: /1일째 해 질 녘/ })).toBeDefined()
  await ui.press({ key: 'tab-sheet' })
  expect(await ui.find({ type: 'Text', text: /미라가 굳기까지/ })).toBeDefined() // 시계는 기록 탭
  expect(await ui.find({ type: 'Text', text: /지난 이야기/ })).toBeDefined()
  await call({ action: 'character', name: '하스', role: '성직자', stats: { wis: 2 }, items: ['꺼진 등불', '붕대×3'] })
  await call({ action: 'meet', name: '하겐', who: '촌장 · 방앗간 주인', note: '딸 미라가 무릎까지 굳었다' })
  await call({ action: 'learn', text: '굳은 다섯 사람 이름 옆에 모두 토비가 적혀 있다', source: '오도의 명부' })
  expect((await call({ action: 'status' })).text).toContain('하겐 (촌장 · 방앗간 주인)')
  await ui.press({ key: 'tab-note' })
  expect(await ui.find({ type: 'Text', text: /딸 미라가/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /토비가 적혀/ })).toBeDefined()
  await ui.press({ key: 'tab-char' })
  expect(await ui.find({ type: 'Text', text: /살피기 · 성직자 주문/ })).toBeDefined() // 능력치와 쓰임
  expect(await ui.find({ type: 'Text', text: /붕대/ })).toBeDefined() // 소지품
  await ui.press({ key: 'tab-map' })
  await call({ action: 'scene', reveal: ['a', '2'], at: '2' })
  expect(await ui.find({ type: 'Text', text: /서재/ })).toBeDefined()
  expect((await call({ action: 'scene', map: 'ashtower#nope' })).text).toContain('안 됐다')
  await ui.unmount()
})
