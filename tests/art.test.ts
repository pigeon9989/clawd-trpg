import { expect, test } from 'claude-code/testing'

import type { Paint } from '../hooks/art'
import { PAL, SPRITE_COLORS, kindOf, paintMap, plain, surfaceOf } from '../hooks/art'
import { renderMap } from '../hooks/world'

/** 칠한 줄을 글자 하나하나로(글자색과 함께) */
function cells(rows: readonly Paint[][]): { ch: string; color?: string; bold?: boolean }[][] {
  return rows.map(row => row.flatMap(p => [...p.text].map(ch => ({ ch, ...(p.color ? { color: p.color } : {}), ...(p.bold ? { bold: true } : {}) }))))
}

const FLOOR = [
  '#########',
  '#1..#.2.#',
  '#...+...#',
  '##+###%##',
  ' #a.....#',
  ' ###+####',
  '   #3*#',
  '   ####',
]

test('던전: 벽은 선으로 잇고, 문은 점선, 바닥은 흐린 점, 일행은 금빛 @', async () => {
  const shown = renderMap(FLOOR, true, ['1', 'a', '2', '3'], '2')
  const one = plain(paintMap(shown, true, {}, 10).rows)
  expect(one[0]).toBe('╭───┬───╮')
  expect(one[1]?.[1]).toBe('1')
  expect(one[1]).toContain('@')
  expect(one[2]?.[4]).toBe('┆') // 세로 벽의 문
  expect(one[3]).toBe('╰┬┄─┴─┄─┤') // 가로 벽의 문(숨은 문은 양쪽을 알아 문으로)
  const grid = cells(paintMap(shown, true, {}, 10).rows).flat()
  expect(grid.find(c => c.ch === '@')).toMatchObject({ color: PAL.at, bold: true })
  expect(grid.find(c => c.ch === '·')?.color).toBe(PAL.floor)
  expect(grid.find(c => c.ch === '┄')?.color).toBe(PAL.door)
  // 두꺼운 벽은 속을 비우고, 나란한 벽은 두 줄로
  expect(plain(paintMap(['#####', '#1..#', '#####', '#####', '#2..#', '#####'], true, {}, 5).rows)[2]).toBe('├───┤')
})

test('던전: 크게 보면 물건이 작은 그림으로', async () => {
  const big = plain(paintMap(['#####', '#$!*#', '#####'], true, {}, 400, 4).rows).join('\n')
  expect(big).toContain('[$]')
  expect(big).toContain('/!\\')
  expect(big).toContain('(*)')
})

test('건물: 원근 박공집 · 굴뚝 연기 · 창 · 상인방 문, 크기마다 깨지지 않게', async () => {
  for (const [w, h] of [[3, 2], [4, 3], [5, 4]] as const) {
    const block = ['.'.repeat(w + 2), ...Array.from({ length: h }, () => `.${'A'.repeat(w)}.`), '.'.repeat(w + 2)]
    for (const z of [3, 4, 5] as const) {
      const art = plain(paintMap(['.'.repeat(w + 2), ...block], false, { A: '두나의 집' }, 400, z).rows).join('\n')
      expect(art).toContain('[]') // 창
      expect(art).toMatch(/\/_+\//) // 처마와 박공
      expect(art).toContain('A') // 이름
      expect(art).not.toMatch(/\[\]\]|\[\[\]|\/\/\/\//) // 늘이다 깨진 흔적이 없다
    }
  }
  const grid = cells(paintMap(['......', '......', '.AAAA.', '.AAAA.', '......'], false, { A: '두나의 집' }, 400, 5).rows).flat()
  expect(grid.some(c => c.ch === '/' && c.color === SPRITE_COLORS.R!.color)).toBe(true) // 지붕
  expect(grid.some(c => c.ch === '[' && c.color === SPRITE_COLORS.G!.color)).toBe(true) // 불 켜진 창
  expect(grid.some(c => (c.ch === ')' || c.ch === '(') && c.color === SPRITE_COLORS.S!.color)).toBe(true) // 연기
})

test('건물 종류: 여관 간판 · 사당 해 문장 · 성 깃발과 창살문 · 종탑의 종', async () => {
  const block = ['......', '......', '.XXXX.', '.XXXX.', '.XXXX.', '......']
  const art = (name: string) => plain(paintMap(block, false, { X: name }, 400, 4).rows).join('\n')
  expect(art('물레방아 여관')).toContain('[X]')
  expect(art('솔라 사당')).toMatch(/\+[\s\S]*O/)
  expect(art('하르벤 성채')).toContain('|>')
  expect(art('하르벤 성채')).toContain('###')
  expect(art('은빛 종탑')).toContain('(^)')
  expect(kindOf('볼크의 대장간')).toBe('smith')
  expect(kindOf('마을 우물')).toBe('well')
})

test('지형: 물 · 나무 · 눈 덮인 봉우리, 범례가 정한 기호', async () => {
  const land = plain(paintMap(['~~TT^^', '~~TT^^'], false, {}, 400, 4).rows).join('\n')
  expect(land).toContain('~')
  expect(land).toContain('&&')
  expect(land).toContain('/^^\\')
  const odd = cells(paintMap(['~~))::'], false, {}, 400, 3, undefined, { '~': '마른 냇바닥', ')': '장막의 막', ':': '장막 안(멈춘 땅)' }).rows).flat()
  expect(odd.some(c => c.ch === '~' && c.color === PAL.sand)).toBe(true)
  expect(odd.some(c => c.color === PAL.veil)).toBe(true)
  expect(odd.some(c => c.color === PAL.water)).toBe(false)
  expect(surfaceOf('무너진 돌')).toBe('rubble')
})

test('확대: 맞춤은 폭에 들어가는 만큼, 손으로 키우면 일행 둘레만 잘라 보여 준다', async () => {
  const wide = ['....................@...................']
  expect(paintMap(wide, false, {}, 200).zoom).toBe(3)
  expect(paintMap(wide, false, {}, 60).zoom).toBe(1)
  const crop = paintMap(wide, false, {}, 60, 5)
  expect(crop.cropped).toBe(true)
  expect(plain(crop.rows).some(line => line.includes('@'))).toBe(true)
  expect(Math.max(...plain(crop.rows).map(l => l.length))).toBeLessThanOrEqual(60)
})
