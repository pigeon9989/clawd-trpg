// clawd-trpg 의 지도 그림: 글자 지도(world/format.md)를 패널에 그릴 때만 아스키아트로 바꾼다.
// 바탕은 칠하지 않는다. 글자 선과 글자 색만 쓴다.
// 던전: 벽 # 는 이웃을 보고 ╭─╮│ 로 잇고, 바닥은 흐린 점, 문은 점선, 물건은 작은 그림.
// 펼친 지도: 건물 · 나무 · 봉우리는 손그림 스프라이트(sprites.ts)를 터 크기에 맞게 늘여 얹고,
// 물 · 풀 · 길은 글자 무늬로. 범례가 뜻을 정한 기호는 그 지형으로 읽는다.
// 칸 하나를 타일 하나로 키운다: 1배(1×1) · 2배(2×1) · 4배(4×2) · 6배(6×3) · 8배(8×4). 크게 볼수록 큰 그림.
// 원본 지도는 그대로다(안개 · 표지 · 검사는 원본으로 한다).

import type { Sprite } from './sprites'
import { SPRITES } from './sprites'

export type Paint = { text: string; color?: string; bg?: string; bold?: boolean; dim?: boolean }
export type Zoom = 1 | 2 | 3 | 4 | 5

/** 글자 색(터미널 256색 팔레트 안의 색) */
export const PAL = {
  wall: '#9aa5ce',
  floor: '#4e4e4e',
  door: '#e0af68',
  label: '#ffffff',
  at: '#ffd75f',
  treasure: '#ffd700',
  danger: '#ff5f5f',
  feature: '#d7afff',
  stairs: '#87d7ff',
  water: '#5f87d7',
  grass: '#5faf00',
  grassDim: '#008700',
  road: '#af875f',
  dust: '#585858',
  stone: '#bcbcbc',
  stoneDim: '#8a8a8a',
  rock: '#a8a8a8',
  sand: '#afaf87',
  veil: '#afafff',
  frozen: '#5f5f87',
  flame: '#ffaf00',
  sign: '#ffd75f',
} as const

/** 스프라이트 색 키 → 글자 색 */
export const SPRITE_COLORS: Record<string, { color: string; bold?: boolean }> = {
  R: { color: '#d75f5f' },
  r: { color: '#af5f5f' },
  W: { color: '#d7d7af' },
  w: { color: '#afaf87' },
  G: { color: '#ffd75f', bold: true },
  D: { color: '#d7875f' },
  C: { color: '#af5f5f' },
  S: { color: '#8a8a8a' },
  E: { color: '#ffaf00', bold: true },
  B: { color: '#bcbcbc' },
  b: { color: '#8a8a8a' },
  F: { color: '#ff5f5f', bold: true },
  Y: { color: '#ffd75f', bold: true },
  T: { color: '#5faf00', bold: true },
  t: { color: '#008700' },
  K: { color: '#af875f' },
  A: { color: '#5f87d7' },
  M: { color: '#a8a8a8' },
  m: { color: '#6c6c6c' },
  N: { color: '#eeeeee', bold: true },
  L: { color: '#ffffff', bold: true },
}

/** 타일 크기 [가로, 세로] */
export const TILE: Record<Zoom, readonly [number, number]> = { 1: [1, 1], 2: [2, 1], 3: [4, 2], 4: [6, 3], 5: [8, 4] }
export const ZOOM_LABEL: Record<Zoom, string> = { 1: '1배', 2: '2배', 3: '4배', 4: '6배', 5: '8배' }
export const ZOOMS: readonly Zoom[] = [1, 2, 3, 4, 5]

type Ch = { ch: string; color?: string; bold?: boolean; dim?: boolean }
type Grid = (Ch | null)[][] // null 은 투명(아래가 비친다)

/** 자리마다 늘 같은 작은 수(점 · 풀을 흩뿌릴 때) */
function hash(x: number, y: number, salt = 0): number {
  let h = (x * 374_761_393 + y * 668_265_263 + salt * 2_147_483_647) | 0
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177)
  return (h ^ (h >>> 16)) >>> 0
}

function canvas(w: number, h: number): Grid {
  return Array.from({ length: h }, () => Array.from({ length: w }, (): Ch | null => null))
}

function dot(g: Grid, y: number, x: number, ch: Ch | null): void {
  const row = g[y]
  if (row && x >= 0 && x < row.length) row[x] = ch
}

/** 투명이 아닌 칸만 얹는다 */
function stamp(target: Grid, art: Grid, top: number, left: number): void {
  art.forEach((row, dy) => row.forEach((ch, dx) => {
    if (ch) dot(target, top + dy, left + dx, ch)
  }))
}

function reader(grid: readonly string[]) {
  const h = grid.length
  const w = Math.max(0, ...grid.map(r => r.length))
  const at = (y: number, x: number) => (y >= 0 && x >= 0 && y < h && x < w ? grid[y]?.[x] ?? ' ' : ' ')
  return { h, w, at }
}

// ── 그림 판 ──────────────────────────────────────────────────────────

/** 글자와 색 키를 함께 쥔 작은 그림(건물 생성기 · 스프라이트가 같이 쓴다) */
class Pic {
  readonly ch: string[][]
  readonly key: string[][]
  readonly above: { y: number; x: number; ch: string; key: string }[] = []
  label?: [number, number]
  constructor(readonly w: number, readonly h: number) {
    this.ch = Array.from({ length: h }, () => Array<string>(w).fill(' '))
    this.key = Array.from({ length: h }, () => Array<string>(w).fill(' '))
  }
  set(y: number, x: number, ch: string, key: string): void {
    if (y >= 0 && y < this.h && x >= 0 && x < this.w) {
      this.ch[y]![x] = ch
      this.key[y]![x] = key
    } else if (y < 0 && x >= 0 && x < this.w) this.above.push({ y, x, ch, key })
  }
  text(y: number, x: number, s: string, key: string): void {
    ;[...s].forEach((c, i) => this.set(y, x + i, c, c === ' ' ? 'o' : key))
  }
}

/** 그림을 칸으로(투명 ' ' 은 null, 속 'o' 는 빈칸) */
function picGrid(p: Pic, label?: string): Grid {
  const g = canvas(p.w, p.h)
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const key = p.key[y]![x]!
    const c = p.ch[y]![x]!
    if (key === ' ' && c === ' ') continue
    if (key === 'o' || c === ' ') {
      dot(g, y, x, { ch: ' ' })
      continue
    }
    dot(g, y, x, { ch: c, ...(SPRITE_COLORS[key] ?? { color: PAL.stoneDim }) })
  }
  if (label && p.label) dot(g, p.label[0], p.label[1], { ch: label, ...SPRITE_COLORS.L! })
  return g
}

/** 정해진 크기의 손그림(나무 · 봉우리 · 우물 · 석상): 이 크기에 드는 가장 큰 것 */
function spritePic(kind: string, W: number, H: number): Pic | undefined {
  const sp: Sprite | undefined = (SPRITES[kind] ?? []).find(s => (s.art[0]?.length ?? 0) <= W && s.art.length <= H)
  if (!sp) return undefined
  const p = new Pic(sp.art[0]!.length, sp.art.length)
  sp.art.forEach((line, y) => [...line].forEach((c, x) => {
    const k = sp.mask[y]?.[x] ?? ' '
    if (c !== ' ' || k !== ' ') p.set(y, x, c, k)
  }))
  if (sp.label) p.label = sp.label
  return p
}

// ── 건물 생성기: 어떤 크기든 깨지지 않게 줄과 칸을 셈해 그린다 ──────

/** 원근 박공집: 왼쪽으로 기운 지붕 · 오른쪽 박공벽 · 굴뚝 · 창 · 상인방 있는 문 */
function housePic(W: number, H: number, kind: Kind): Pic | undefined {
  const d = H >= 9 ? 3 : H >= 5 ? 2 : 1
  const F = W - 2 * d + 1 // 정면 폭
  if (F < 6 || H < d + 3) return undefined
  const p = new Pic(W, H)
  const side = W - 1
  // 용마루
  for (let x = d; x <= F + d - 3; x++) p.set(0, x, '_', 'R')
  // 지붕 경사 · 처마 · 박공
  for (let r = 1; r <= d; r++) {
    const left = d - r
    const front = F - 1 + d - r
    const gable = F + d + r - 2
    p.set(r, left, '/', 'R')
    for (let x = left + 1; x < front; x++) p.set(r, x, r === d ? '_' : (x + r) % 4 === 0 ? "'" : ' ', r === d ? 'R' : 'r')
    p.set(r, front, '/', 'R')
    for (let x = front + 1; x < gable; x++) p.set(r, x, ' ', 'o')
    p.set(r, gable, '\\', 'r')
  }
  // 벽
  for (let y = d + 1; y < H; y++) {
    const floor = y === H - 1
    p.set(y, 0, '|', 'W')
    for (let x = 1; x < F - 1; x++) p.set(y, x, floor ? '_' : ' ', floor ? 'W' : 'o')
    p.set(y, F - 1, '|', 'W')
    for (let x = F; x < side; x++) p.set(y, x, floor ? '_' : ' ', floor ? 'w' : 'o')
    p.set(y, side, '|', 'w')
  }
  // 문(상인방 · 손잡이)
  const dw = F >= 12 ? 4 : 3
  const dx = Math.floor((F - dw) / 2)
  p.set(H - 1, dx, '|', 'D')
  p.set(H - 1, dx + dw - 1, '|', 'D')
  for (let x = dx + 1; x < dx + dw - 1; x++) p.set(H - 1, x, x === dx + dw - 2 && dw === 4 ? '.' : ' ', x === dx + dw - 2 && dw === 4 ? 'Y' : 'o')
  if (H - 2 > d) for (let x = dx + 1; x < dx + dw - 1; x++) p.set(H - 2, x, '_', 'D')
  // 여관 · 상점은 층 사이 띠, 상점은 차양
  const firstWall = d + 1
  let windowsFrom = firstWall
  if (kind === 'shop' && H - 2 > firstWall) {
    for (let x = 1; x < F - 1; x++) p.set(firstWall, x, x % 2 ? '\\' : '/', 'F')
    windowsFrom = firstWall + 1
  }
  if (kind === 'inn' && H - firstWall >= 5) for (let x = 1; x < F - 1; x++) p.set(firstWall + 1, x, '-', 'w')
  // 간판 · 이름 자리를 먼저 잡는다
  const hasSign = kind === 'inn' || kind === 'shop' || kind === 'smith'
  const signY = Math.min(H - 2, kind === 'shop' ? windowsFrom : firstWall)
  const signX = Math.max(1, Math.min(F - 5, dx + dw + 1))
  const nameY = firstWall + (kind === 'shop' && H - 2 > firstWall ? 1 : 0)
  const taken = (y: number, x: number) => (hasSign ? y === signY && x >= signX - 1 && x <= signX + 3 : y === nameY && x <= 2)
  // 창: 문 위 줄까지, 두 줄 걸러
  for (let y = windowsFrom; y < H - 1; y++) {
    if (kind === 'inn' && H - firstWall >= 5 && y === firstWall + 1) continue
    if ((y - windowsFrom) % 2 === 1 && H - firstWall > 3) continue
    // 문 줄은 문 왼쪽 · 오른쪽 빈자리에만
    const spots: number[] = []
    if (y < H - 2) for (let x = 2; x + 1 <= F - 3; x += 4) spots.push(x)
    else {
      for (let x = 2; x + 1 <= dx - 1; x += 4) spots.push(x)
      for (let x = F - 3; x >= dx + dw; x -= 4) spots.push(x)
    }
    for (const x of spots) {
      if (taken(y, x) || taken(y, x + 1)) continue
      p.text(y, x, '[]', 'G')
    }
  }
  // 박공벽 작은 창
  if (side - F >= 2) p.text(firstWall, F + Math.floor((side - F - 2) / 2), '[]', 'G')
  // 굴뚝과 연기(대장간은 불티)
  const cx = Math.min(F + d - 6, d + 2)
  if (cx > d) {
    p.set(0, cx, '|', 'C')
    p.set(0, cx + 1, ' ', 'o')
    p.set(0, cx + 2, '|', 'C')
    p.text(-1, cx, '___', 'C')
    if (kind === 'smith') {
      p.set(-2, cx + 1, '*', 'E')
      p.set(-3, cx + 3, '.', 'E')
      p.set(-2, cx + 4, '*', 'E')
    } else {
      p.set(-2, cx + 3, ')', 'S')
      p.set(-3, cx + 2, '(', 'S')
    }
  }
  // 종류별 덧그림
  if (hasSign) {
    // 걸린 간판 [A]
    p.text(signY, signX, '[ ]', 'Y')
    p.label = [signY, signX + 1]
  } else p.label = [Math.min(H - 2, nameY), 1]
  if (kind === 'smith' && side - F >= 2) p.text(H - 2, F, '>=', 'b')
  if (kind === 'mill') {
    // 물레바퀴: 박공벽 밖으로
    const wx = side - 2
    if (H - 3 > d) {
      p.text(H - 3, wx, '\\|/', 'A')
      p.text(H - 2, wx, '-+-', 'A')
      p.text(H - 1, wx, '/|\\', 'A')
    }
  }
  return p
}

/** 앞박공 사당: 박공 속 해 문장 · 기둥 · 아치 문 · 계단 */
function templePic(W: number, H: number): Pic | undefined {
  if (W < 7 || H < 5) return undefined
  const p = new Pic(W, H)
  // 박공은 한 줄에 한두 칸씩 넓어지게(납작하지 않게), 기둥 줄은 셋 이상 남긴다
  const R = Math.max(2, Math.min(Math.floor(H / 2), H - 3, Math.ceil(W / 2 / 1.6)))
  const cx = (W - 1) / 2
  for (let r = 0; r < R; r++) {
    const half = ((r + 1) * (W / 2 - 0.5)) / R
    const l = Math.round(cx - half)
    const rr = Math.round(cx + half)
    p.set(r, l, '/', 'B')
    p.set(r, rr, '\\', 'B')
    for (let x = l + 1; x < rr; x++) p.set(r, x, r === R - 1 ? '_' : ' ', r === R - 1 ? 'B' : 'o')
  }
  if (R >= 3) p.set(Math.floor(R / 2) + 1, Math.round(cx), 'O', 'Y')
  p.set(-1, Math.round(cx), '+', 'Y')
  // 기둥 · 문 · 계단
  const doorW = W >= 13 ? 3 : 1
  const dx = Math.round(cx - (doorW - 1) / 2)
  for (let y = R; y < H; y++) {
    const last = y === H - 1
    for (let x = 0; x < W; x++) {
      const pillar = x > 0 && x < W - 1 && (x - 1) % 3 === 0 && (x < dx - 1 || x > dx + doorW)
      if (last) p.set(y, x, x === 0 ? '/' : x === W - 1 ? '\\' : '_', 'b')
      else p.set(y, x, pillar ? '|' : ' ', pillar ? 'B' : 'o')
    }
  }
  for (let y = Math.max(R, H - 3); y < H - 1; y++) {
    p.set(y, dx - 1, y === Math.max(R, H - 3) ? '/' : '|', 'D')
    p.set(y, dx + doorW, y === Math.max(R, H - 3) ? '\\' : '|', 'D')
  }
  p.label = [R, Math.max(1, dx - 3)]
  return p
}

/** 종탑 · 망루: 좁은 몸통 · 뾰족 첨탑 · 종 */
function towerPic(W: number, H: number, bell: boolean): Pic | undefined {
  if (W < 3 || H < 4) return undefined
  const p = new Pic(W, H)
  let bw = Math.min(W, Math.max(5, Math.round(W * 0.55)))
  if (bw % 2 === 0) bw -= 1
  bw = Math.max(3, bw)
  const ox = Math.floor((W - bw) / 2)
  const cx = ox + (bw - 1) / 2
  const R = Math.max(2, Math.round(H * 0.35))
  for (let r = 0; r < R; r++) {
    const half = r === 0 ? 0.5 : ((r + 0.5) * (bw / 2)) / R
    const l = Math.round(cx - half)
    const rr = Math.round(cx + half)
    p.set(r, l, '/', 'R')
    p.set(r, rr, '\\', 'R')
    for (let x = l + 1; x < rr; x++) p.set(r, x, r === R - 1 ? '_' : r === 0 ? '^' : ' ', r === R - 1 ? 'R' : r === 0 ? 'Y' : 'o')
  }
  p.set(-1, Math.round(cx), '|', 'Y')
  for (let y = R; y < H; y++) {
    p.set(y, ox, '|', 'B')
    p.set(y, ox + bw - 1, '|', 'B')
    for (let x = ox + 1; x < ox + bw - 1; x++) p.set(y, x, y === H - 1 ? '_' : ' ', y === H - 1 ? 'B' : 'o')
  }
  const mid = Math.round(cx)
  if (bell && H - R >= 3) p.text(R, mid - 1, '(^)', 'Y')
  else if (H - R >= 3) p.set(R, mid, '|', 'G')
  if (H - R >= 4) p.set(H - 2, mid, 'n', 'D')
  p.label = [Math.min(H - 2, R + 1), mid]
  return p
}

/** 성 · 망대: 양 끝 탑 · 성가퀴 · 깃발 · 창살문 */
function castlePic(W: number, H: number): Pic | undefined {
  if (W < 8 || H < 4) return undefined
  const p = new Pic(W, H)
  const tw = W >= 16 ? 4 : 3
  // 성가퀴: 탑은 한 줄 높게
  for (let x = 0; x < W; x++) {
    const tower = x < tw || x >= W - tw
    const edgeL = x === 0 || x === W - tw
    const edgeR = x === tw - 1 || x === W - 1
    if (tower) p.set(0, x, edgeL ? '[' : edgeR ? ']' : '_', 'B')
    else p.set(1, x, (x - tw) % 2 === 0 ? '_' : '|', 'B')
  }
  p.set(-1, 1, '|', 'b')
  p.set(-1, 2, '>', 'F')
  p.set(-1, W - tw + 1, '|', 'b')
  p.set(-1, W - tw + 2, '>', 'F')
  for (let y = 1; y < H; y++) {
    for (const x0 of [0, W - tw]) {
      p.set(y, x0, '|', 'B')
      p.set(y, x0 + tw - 1, '|', 'B')
      for (let x = x0 + 1; x < x0 + tw - 1; x++) p.set(y, x, y === H - 1 ? '_' : ' ', y === H - 1 ? 'B' : 'o')
    }
    if (y >= 2) for (let x = tw; x < W - tw; x++) p.set(y, x, y === H - 1 ? '_' : ' ', y === H - 1 ? 'B' : 'o')
  }
  if (H >= 5) {
    p.text(2, 1, tw >= 4 ? '[]' : '|', 'G')
    p.text(2, W - tw + 1, tw >= 4 ? '[]' : '|', 'G')
  }
  // 창살문
  const gw = W - 2 * tw >= 9 ? 5 : 3
  const gx = Math.floor((W - gw) / 2)
  if (H >= 5) {
    p.set(H - 3, gx, '/', 'D')
    for (let x = gx + 1; x < gx + gw - 1; x++) p.set(H - 3, x, '#', 'b')
    p.set(H - 3, gx + gw - 1, '\\', 'D')
  }
  for (let y = Math.max(2, H - 2); y < H; y++) {
    p.set(y, gx, '|', 'D')
    for (let x = gx + 1; x < gx + gw - 1; x++) p.set(y, x, '#', 'b')
    p.set(y, gx + gw - 1, '|', 'D')
  }
  p.label = [2, Math.floor(W / 2)]
  if (H < 5) p.label = [Math.max(2, H - 2), tw]
  return p
}

/** 이 종류 건물을 W × H 터에 맞게 */
function buildingPic(kind: Kind, W: number, H: number): Pic | undefined {
  switch (kind) {
    case 'temple': return templePic(W, H) ?? housePic(W, H, 'house')
    case 'tower': return towerPic(W, H, true)
    case 'castle': return castlePic(W, H) ?? housePic(W, H, 'house')
    case 'well': case 'statue': return spritePic(kind, W, H)
    default: return housePic(W, H, kind) ?? housePic(W, H, 'house')
  }
}

/** 아주 작은 터: 지붕 한 줄 + 이름 */
function hutPic(W: number, H: number): Pic {
  const p = new Pic(W, H)
  if (W >= 2 && H >= 2) {
    p.set(H - 2, 0, '/', 'R')
    p.set(H - 2, W - 1, '\\', 'R')
    for (let x = 1; x < W - 1; x++) p.set(H - 2, x, '‾', 'R')
  }
  p.label = [H - 1, Math.floor((W - 1) / 2)]
  return p
}

// ── 던전(안개 지도) ──────────────────────────────────────────────────

const BOX = ['▪', '│', '─', '╰', '│', '│', '╭', '├', '─', '╯', '─', '┴', '╮', '┤', '┬', '┼']
const N = 1
const E = 2
const S = 4
const W = 8

/** 벽 칸들의 잇기 방향. 나란히 달리는 두 벽 사이에 끼인 이음은 끊는다 */
function wallMasks(h: number, w: number, isWall: (y: number, x: number) => boolean): number[][] {
  const raw = (y: number, x: number): number => {
    if (!isWall(y, x)) return 0
    return (isWall(y - 1, x) ? N : 0) | (isWall(y, x + 1) ? E : 0) | (isWall(y + 1, x) ? S : 0) | (isWall(y, x - 1) ? W : 0)
  }
  const flat = (m: number) => (m & (E | W)) !== 0
  const tall = (m: number) => (m & (N | S)) !== 0
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      let m = raw(y, x)
      const here = m
      if (m & S && flat(here) && flat(raw(y + 1, x)) && !(here & N) && !(raw(y + 1, x) & S)) m &= ~S
      if (m & N && flat(here) && flat(raw(y - 1, x)) && !(here & S) && !(raw(y - 1, x) & N)) m &= ~N
      if (m & E && tall(here) && tall(raw(y, x + 1)) && !(here & W) && !(raw(y, x + 1) & E)) m &= ~E
      if (m & W && tall(here) && tall(raw(y, x - 1)) && !(here & E) && !(raw(y, x - 1) & W)) m &= ~W
      return m
    }),
  )
}

/** 벽 · 문 타일: 선이 타일 가운데로 지난다 */
function wallTile(m: number, isDoor: boolean, tw: number, th: number, color: string): Grid {
  const across = (m & (E | W)) !== 0 && (m & (N | S)) === 0
  const down = (m & (N | S)) !== 0 && (m & (E | W)) === 0
  const style = isDoor ? { color: PAL.door, bold: true } : { color }
  const horiz = isDoor && across ? '┄' : '─'
  const vert = isDoor && down ? '┆' : '│'
  const junction = isDoor ? (across ? '┄' : down ? '┆' : '+') : (BOX[m] ?? '▪')
  const r0 = Math.floor((th - 1) / 2)
  const c0 = tw >= 4 ? Math.floor((tw - 1) / 2) : 0
  const t = canvas(tw, th)
  for (let dy = 0; dy < th; dy++) {
    for (let dx = 0; dx < tw; dx++) {
      if (dy === r0) {
        if (dx === c0) dot(t, dy, dx, { ch: junction, ...style })
        else if ((dx < c0 && m & W) || (dx > c0 && m & E)) dot(t, dy, dx, { ch: horiz, ...style })
      } else if (dx === c0 && ((dy < r0 && m & N) || (dy > r0 && m & S))) dot(t, dy, dx, { ch: vert, ...style })
    }
  }
  return t
}

/** 방 안 칸: 흐린 바닥 점 위에 물건 */
function floorTile(c: string, tw: number, th: number, gy: number, gx: number): Grid {
  const t = canvas(tw, th)
  const rr = Math.floor((th - 1) / 2)
  const cc = Math.floor((tw - 1) / 2)
  const put = (y: number, x: number, ch: string, style: Omit<Ch, 'ch'>) => dot(t, y, x, { ch, ...style })
  // 바닥: 1배는 칸마다, 크면 드문드문
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    if (tw === 1 || hash(gx + x, gy + y) % (tw >= 6 ? 7 : 4) === 0) put(y, x, '·', { color: PAL.floor })
    else put(y, x, ' ', {})
  }
  const big = tw >= 6
  switch (c) {
    case '.': break
    case '@':
      put(rr, cc, '@', { color: PAL.at, bold: true })
      break
    case '~':
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) put(y, x, (gx + x + (gy + y) * 2) % 3 === 0 || tw === 1 ? '~' : ' ', { color: PAL.water })
      break
    case '"':
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) if (tw === 1 || hash(gx + x, gy + y, 7) % 3 === 0) put(y, x, '"', { color: PAL.grass })
      break
    case ':':
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) if (tw === 1 || hash(gx + x, gy + y, 3) % 3 === 0) put(y, x, hash(gx + x, gy + y, 5) % 2 ? ',' : '.', { color: PAL.rock })
      break
    case '=':
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) put(y, x, '═', { color: PAL.door })
      break
    case '$':
      if (big) {
        put(rr, cc - 1, '[', { color: PAL.road })
        put(rr, cc, '$', { color: PAL.treasure, bold: true })
        put(rr, cc + 1, ']', { color: PAL.road })
      } else put(rr, cc, '$', { color: PAL.treasure, bold: true })
      break
    case '!':
      if (big) {
        put(rr, cc - 1, '/', { color: PAL.danger })
        put(rr, cc, '!', { color: PAL.danger, bold: true })
        put(rr, cc + 1, '\\', { color: PAL.danger })
      } else put(rr, cc, '!', { color: PAL.danger, bold: true })
      break
    case '*':
      if (big) {
        put(rr, cc - 1, '(', { color: PAL.feature })
        put(rr, cc, '*', { color: PAL.feature, bold: true })
        put(rr, cc + 1, ')', { color: PAL.feature })
      } else put(rr, cc, '*', { color: PAL.feature, bold: true })
      break
    case '<':
    case '>':
      put(rr, cc, c, { color: PAL.stairs, bold: true })
      if (tw >= 2) put(rr, cc + 1, c, { color: PAL.stairs, bold: true })
      if (big) put(rr, cc + 2, c, { color: PAL.stairs })
      break
    default:
      put(rr, cc, c, /^[0-9A-Z]$/.test(c) ? { color: PAL.label, bold: true } : { color: PAL.rock })
  }
  return t
}

function dungeon(grid: readonly string[], z: Zoom): Grid {
  const { h, w, at } = reader(grid)
  const [tw, th] = TILE[z]
  const open = (c: string) => c !== '#' && c !== '+' && c !== ' '
  const drawn = (y: number, x: number): boolean => {
    const c = at(y, x)
    if (c === '+') return true
    if (c !== '#') return false
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dy || dx) && open(at(y + dy, x + dx))) return true
    return false
  }
  const masks = wallMasks(h, w, drawn)
  const out = canvas(w * tw, h * th)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = at(y, x)
      if (c === ' ') continue
      if (c === '#' || c === '+') {
        if (drawn(y, x)) stamp(out, wallTile(masks[y]![x]!, c === '+', tw, th, PAL.wall), y * th, x * tw)
        continue
      }
      stamp(out, floorTile(c, tw, th, y * th, x * tw), y * th, x * tw)
    }
  }
  return out
}

// ── 펼친 지도 ────────────────────────────────────────────────────────

type Kind = 'house' | 'inn' | 'shop' | 'smith' | 'mill' | 'tower' | 'temple' | 'castle' | 'well' | 'statue'

export function kindOf(name: string): Kind {
  if (/우물|샘/.test(name)) return 'well'
  if (/석상|동상|조각상|비석/.test(name)) return 'statue'
  if (/여관|주점|선술집|숙소|객잔/.test(name)) return 'inn'
  if (/대장간|공방|대장장이/.test(name)) return 'smith'
  if (/방앗간|물레방아|제분/.test(name)) return 'mill'
  if (/탑|종루|첨탑|망루|등대/.test(name)) return 'tower'
  if (/사당|신전|수도원|예배당|성당|교회|사원/.test(name)) return 'temple'
  if (/성채|요새|성관|궁전|궁|망대|성$|성 |성벽/.test(name)) return 'castle'
  if (/상점|가게|상회|시장|장터|창고|경매/.test(name)) return 'shop'
  return 'house'
}

type Surface = 'water' | 'dry' | 'grass' | 'tree' | 'mountain' | 'hill' | 'road' | 'rubble' | 'statue' | 'veil' | 'frozen' | 'band' | 'flame' | 'wall' | 'bridge'

const SURFACES: readonly [RegExp, Surface][] = [
  [/마른|냇바닥|모래밭|사막/, 'dry'],
  [/장막 안|멈춘 땅|멈춘/, 'frozen'],
  [/막$|장막의 막|장막 경계|막 /, 'veil'],
  [/물|강|호수|늪|바다|냇물|개울|웅덩이/, 'water'],
  [/나무|숲|수풀/, 'tree'],
  [/산|봉우리|절벽|바위산/, 'mountain'],
  [/언덕|구릉|둔덕/, 'hill'],
  [/다리/, 'bridge'],
  [/길|가도|도로|거리|골목/, 'road'],
  [/들|풀|밭|초원|정원|잔디/, 'grass'],
  [/돌|잔해|무너진|바위|폐허/, 'rubble'],
  [/석상|동상|조각/, 'statue'],
  [/띠/, 'band'],
  [/촛불|등불|횃불|불씨|불/, 'flame'],
  [/담|벽|울타리|망대/, 'wall'],
]

export function surfaceOf(name: string): Surface | undefined {
  return SURFACES.find(([re]) => re.test(name))?.[1]
}

/** 기본 글자로 그리면 되는 지형 */
const PLAIN: Partial<Record<Surface, string>> = { water: '~', grass: '"', tree: 'T', mountain: '^', road: '.', rubble: ':', bridge: '=', wall: '#', statue: 'o', flame: '*' }

/** 펼친 지도의 한 칸 */
function terrain(c: string, sf: Surface | undefined, z: Zoom, gy: number, gx: number, links: number, square: boolean, lonely: boolean): Grid {
  const [tw, th] = TILE[z]
  const t = canvas(tw, th)
  const rr = Math.floor((th - 1) / 2)
  const cc = Math.floor((tw - 1) / 2)
  const put = (y: number, x: number, ch: string, style: Omit<Ch, 'ch'>) => dot(t, y, x, { ch, ...style })
  const scatter = (every: number, salt: number, pick: (k: number) => Ch) => {
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const k = hash(gx + x, gy + y, salt)
      if (k % every === 0) dot(t, y, x, pick(k))
    }
  }
  const sprite = (kind: string) => {
    const pic = spritePic(kind, tw, th)
    if (!pic) return undefined
    const g = canvas(tw, th)
    stamp(g, picGrid(pic), th - pic.h, Math.floor((tw - pic.w) / 2))
    return g
  }
  switch (sf ?? c) {
    case ' ':
      scatter(37, 31, () => ({ ch: '.', color: PAL.dust }))
      return t
    case 'veil':
      for (let y = 0; y < th; y++) put(y, cc, c === ')' || c === '(' ? c : '│', { color: PAL.veil, bold: true })
      return t
    case 'frozen':
      scatter(5, 51, () => ({ ch: '·', color: PAL.frozen }))
      return t
    case 'band':
      scatter(4, 53, () => ({ ch: "'", color: PAL.frozen }))
      return t
    case 'dry':
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) if ((gx + x + (gy + y) * 2) % 4 === 0 || tw === 1) put(y, x, '~', { color: PAL.sand })
      return t
    case 'hill':
      if (tw >= 4) {
        for (let x = 1; x < tw - 1; x++) put(th - 1, x, x === 1 ? '/' : x === tw - 2 ? '\\' : '‾', { color: PAL.grassDim })
        return t
      }
      put(rr, cc, 'n', { color: PAL.grassDim })
      return t
    case '^':
    case 'mountain':
      return z >= 3 ? sprite('peak') ?? t : (put(0, 0, z === 2 ? '/' : '^', { color: PAL.rock, bold: true }), z === 2 && put(0, 1, '\\', { color: '#6c6c6c', bold: true }), t)
    case 'T':
    case 'tree':
      if (z >= 3) return sprite('tree') ?? t
      put(0, 0, 'T', { color: PAL.grass, bold: true })
      if (tw === 2) put(0, 1, 't', { color: PAL.grassDim })
      return t
    case '~':
    case 'water':
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) if ((gx + x + (gy + y) * 2) % 3 === 0 || tw <= 2) put(y, x, tw <= 2 && x === 1 ? ' ' : '~', { color: PAL.water })
      return t
    case '"':
    case 'grass':
      if (tw === 1) return (put(0, 0, '"', { color: PAL.grass }), t)
      scatter(lonely ? 5 : 3, 11, k => ({ ch: k % 4 === 1 ? ',' : k % 4 === 2 ? "'" : '"', color: k % 2 ? PAL.grass : PAL.grassDim }))
      return t
    case '.':
    case 'road': {
      if (square) {
        scatter(9, 17, () => ({ ch: '.', color: PAL.dust }))
        return t
      }
      const road: Ch = { ch: '·', color: PAL.road }
      if (tw <= 2 || !links) {
        for (let x = 0; x < tw; x++) put(rr, x, '·', road)
        return t
      }
      const east = links & 2 || links & 16 || links & 32
      const west = links & 8 || links & 64 || links & 128
      const north = links & 1 || links & 16 || links & 128
      const south = links & 4 || links & 32 || links & 64
      for (let x = 0; x < tw; x++) if (x === cc || (x < cc && west) || (x > cc && east)) put(rr, x, '·', road)
      for (let y = 0; y < th; y++) if ((y < rr && north) || (y > rr && south)) put(y, cc, ':', road)
      return t
    }
    case '=':
    case 'bridge':
      for (let x = 0; x < tw; x++) put(rr, x, '═', { color: PAL.road })
      if (th >= 2) for (let x = 0; x < tw; x += 2) put(Math.min(th - 1, rr + 1), x, '╨', { color: PAL.road })
      return t
    case ':':
    case 'rubble':
      scatter(tw === 1 ? 1 : 3, 3, k => ({ ch: k % 2 ? ',' : '.', color: PAL.rock }))
      return t
    case 'o':
    case 'statue':
      return z >= 4 ? sprite('statue') ?? (put(rr, cc, 'o', { color: PAL.stone, bold: true }), t) : (put(rr, cc, c === 'o' ? 'o' : 'i', { color: PAL.stone, bold: true }), t)
    case '*':
    case 'flame':
      put(rr, cc, '*', { color: PAL.flame, bold: true })
      return t
    case '@':
      put(rr, cc, '@', { color: PAL.at, bold: true })
      return t
    case '!':
      put(rr, cc, '!', { color: PAL.danger, bold: true })
      return t
    default:
      put(rr, cc, c, { color: PAL.dust })
      return t
  }
}

/** 펼친 지도(지역 · 마을 · 성 바깥) */
function overland(grid: readonly string[], names: Readonly<Record<string, string>>, z: Zoom, glyphs: Readonly<Record<string, string>>): Grid {
  const { h, w, at } = reader(grid)
  const [tw, th] = TILE[z]
  const out = canvas(w * tw, h * th)
  const isPlace = (c: string) => /^[0-9A-Z]$/.test(c) && c in names
  const sf = (c: string) => (glyphs[c] ? surfaceOf(glyphs[c]!) : undefined)
  const plainOf = (c: string) => {
    const k = sf(c)
    return k && PLAIN[k] ? PLAIN[k]! : c
  }
  const roadish = (c: string) => ['.', '=', '+', '@'].includes(plainOf(c)) || isPlace(c)
  const groundish = (c: string) => ['.', '"', '*', '@'].includes(plainOf(c)) || isPlace(c)
  const isWall = (y: number, x: number) => plainOf(at(y, x)) === '#' || at(y, x) === '+'
  const masks = wallMasks(h, w, isWall)
  // 건물은 나중에 얹는다(굴뚝 연기 · 깃발이 위 칸으로 솟아도 지형에 덮이지 않게)
  const later: { y: number; x: number; g: Grid }[] = []
  const decor: { y: number; x: number; ch: Ch }[] = []
  const done = new Set<string>()
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (done.has(`${y},${x}`)) continue
      const raw = at(y, x)
      const oy = y * th
      const ox = x * tw
      if (isWall(y, x)) {
        stamp(out, wallTile(masks[y]![x]!, raw === '+', tw, th, PAL.stone), oy, ox)
        continue
      }
      if (!isPlace(raw)) {
        const c = plainOf(raw)
        const n = roadish(at(y - 1, x))
        const e = roadish(at(y, x + 1))
        const s2 = roadish(at(y + 1, x))
        const wv = roadish(at(y, x - 1))
        const diag = (dy: number, dx: number, a: boolean, b: boolean) => !a && !b && plainOf(at(y + dy, x + dx)) === '.'
        const links = (n ? 1 : 0) | (e ? 2 : 0) | (s2 ? 4 : 0) | (wv ? 8 : 0) |
          (diag(-1, 1, n, e) ? 16 : 0) | (diag(1, 1, s2, e) ? 32 : 0) | (diag(1, -1, s2, wv) ? 64 : 0) | (diag(-1, -1, n, wv) ? 128 : 0)
        const narrow = (!groundish(at(y, x - 1)) && !groundish(at(y, x + 1))) || (!groundish(at(y - 1, x)) && !groundish(at(y + 1, x)))
        const lonely = c === '"' && ![at(y - 1, x), at(y, x + 1), at(y + 1, x), at(y, x - 1)].some(nb => plainOf(nb) === '"')
        const surface = sf(raw)
        const special = surface && !PLAIN[surface] ? surface : undefined
        stamp(out, terrain(c, special, z, oy, ox, links, c === '.' && !narrow, lonely), oy, ox)
        continue
      }
      // 같은 글자로 채운 사각형이면 건물
      let x2 = x
      while (at(y, x2 + 1) === raw && !done.has(`${y},${x2 + 1}`)) x2++
      let y2 = y
      const rowFull = (yy: number) => Array.from({ length: x2 - x + 1 }, (_, k) => at(yy, x + k) === raw).every(Boolean)
      while (rowFull(y2 + 1)) y2++
      for (let yy = y; yy <= y2; yy++) for (let xx = x; xx <= x2; xx++) done.add(`${yy},${xx}`)
      const kind = kindOf(names[raw] ?? '')
      const W2 = (x2 - x + 1) * tw
      const H2 = (y2 - y + 1) * th
      // 한 칸짜리 장소는 작은 그림이 들어가면 그림, 아니면 금빛 글자
      const wide = W2 > tw || H2 > th
      const pic = z >= 3 || wide ? buildingPic(kind, W2, H2) ?? (wide ? hutPic(W2, H2) : undefined) : undefined
      if (pic) {
        const top = oy + H2 - pic.h
        const left = ox + Math.floor((W2 - pic.w) / 2)
        later.push({ y: top, x: left, g: picGrid(pic, raw) })
        for (const a of pic.above) decor.push({ y: top + a.y, x: left + a.x, ch: { ch: a.ch, ...(SPRITE_COLORS[a.key] ?? {}) } })
      } else {
        const t = canvas(W2, H2)
        dot(t, Math.floor((H2 - 1) / 2), Math.floor((W2 - 1) / 2), { ch: raw, color: PAL.sign, bold: true })
        later.push({ y: oy, x: ox, g: t })
      }
    }
  }
  for (const b of later) stamp(out, b.g, b.y, b.x)
  // 굴뚝 연기 · 깃발 · 꼭지는 빈 하늘(건물이 아닌 칸)에만
  for (const d of decor) {
    const cell = out[d.y]?.[d.x]
    if (d.y >= 0 && d.x >= 0 && d.x < (out[0]?.length ?? 0) && (!cell || cell.ch === ' ' || cell.ch === '.' || cell.ch === '·')) dot(out, d.y, d.x, d.ch)
  }
  return out
}

// ── 합치기 ───────────────────────────────────────────────────────────

/** 같은 모양이 이어진 글자를 한 조각으로, 줄 끝 빈칸은 덜어 낸다 */
function merge(row: readonly (Ch | null)[]): Paint[] {
  const out: Paint[] = []
  for (const cell of row) {
    const c = cell ?? { ch: ' ' }
    const last = out[out.length - 1]
    if (last && last.color === c.color && last.bold === c.bold && last.dim === c.dim) last.text += c.ch
    else out.push({ text: c.ch, ...(c.color ? { color: c.color } : {}), ...(c.bold ? { bold: true } : {}), ...(c.dim ? { dim: true } : {}) })
  }
  while (out.length) {
    const last = out[out.length - 1]!
    const trimmed = last.text.trimEnd()
    if (trimmed === last.text) break
    last.text = trimmed
    if (last.text) break
    out.pop()
  }
  return out
}

/** 이 폭에 들어가는 가장 큰 확대(맞춤은 4배까지: 6 · 8배는 손으로 고른다) */
export function fitZoom(mapWidth: number, width: number): Zoom {
  for (const z of [3, 2] as const) if (mapWidth * TILE[z][0] <= width) return z
  return 1
}

export type Painted = { rows: Paint[][]; zoom: Zoom; cropped: boolean }

/**
 * 지도 한 장을 칠한 줄들로. zoom 을 안 주면 width 안에 들어가는 가장 큰 확대.
 * 그린 것이 width · maxRows 보다 크면 일행 @(없으면 가운데) 둘레만 잘라 보여 준다.
 */
export function paintMap(grid: readonly string[], fog: boolean, names: Readonly<Record<string, string>>, width: number, zoom?: Zoom, maxRows?: number, glyphs: Readonly<Record<string, string>> = {}): Painted {
  const w = Math.max(0, ...grid.map(r => r.length))
  const z = zoom ?? fitZoom(w, width)
  const [tw, th] = TILE[z]
  let chars = fog ? dungeon(grid, z) : overland(grid, names, z, glyphs)
  let fy = Math.floor(grid.length / 2)
  let fx = Math.floor(w / 2)
  grid.forEach((row, y) => {
    const x = row.indexOf('@')
    if (x >= 0) {
      fy = y
      fx = x
    }
  })
  let cropped = false
  const totalW = w * tw
  if (totalW > width) {
    const start = Math.max(0, Math.min(totalW - width, fx * tw + Math.floor(tw / 2) - Math.floor(width / 2)))
    chars = chars.map(row => row.slice(start, start + width))
    cropped = true
  }
  if (maxRows && chars.length > maxRows) {
    const start = Math.max(0, Math.min(chars.length - maxRows, fy * th + Math.floor(th / 2) - Math.floor(maxRows / 2)))
    chars = chars.slice(start, start + maxRows)
    cropped = true
  }
  const rows = chars.map(merge)
  while (rows.length && !rows[rows.length - 1]!.length) rows.pop()
  return { rows, zoom: z, cropped }
}

/** 칠한 줄을 글자로(테스트 · 디버그) */
export function plain(rows: readonly Paint[][]): string[] {
  return rows.map(r => r.map(p => p.text).join(''))
}
