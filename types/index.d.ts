/** 능력치: 힘 · 민첩 · 체력 · 지능 · 지혜 · 매력. 값은 보정치(-1 ~ +3) */
export type Stat = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'
export type Stats = Record<Stat, number>

export type Item = { name: string; qty: number; note?: string }

export type Character = {
  name: string
  /** 직업: 전사 · 도적 · 마법사 · 성직자 · 레인저 · 음유시인(자유 글) */
  role: string
  /** 주인님 캐릭터면 true, 동료 NPC 는 false */
  isPlayer: boolean
  level: number
  xp: number
  hp: number
  maxHp: number
  armor: number
  /** 피해 주사위: "d10" */
  damage: string
  stats: Stats
  items: Item[]
  gold: number
  conditions: string[]
  moves: string[]
  look: string
  /** 다음 굴림에 한 번 더하는 보정(PbtA 의 forward) */
  forward: number
}

export type Foe = { name: string; hp: number; maxHp: number; armor: number; damage: string; note: string }

export type Scene = {
  title: string
  text: string
  map: string[]
  foes: Foe[]
  /** 세계 문서에서 가져온 지도면 그 참조("ashtower#f1"), 손으로 그린 지도면 '' */
  mapRef: string
  /** 안개 지도: 드러낸 표지의 구역만 보인다 */
  fog: boolean
  revealed: string[]
  /** 일행이 있는 표지(그 자리에 @) */
  at: string
  /** 표지 → 방 · 장소 이름 */
  rooms: Record<string, string>
  /** 지도 기호 → 범례의 뜻(그림판이 색을 고를 때) */
  glyphs: Record<string, string>
}

/** 위협 시계: size 칸 중 filled 칸. visible 이 아니면 패널에 안 보인다 */
export type Clock = { name: string; size: number; filled: number; visible: boolean; note: string }

/** 하루는 다섯 때: 0 새벽 · 1 아침 · 2 낮 · 3 해 질 녘 · 4 밤 */
export type GameTime = { day: number; part: number }

export type QuestStatus = 'active' | 'done' | 'failed'
export type Quest = { title: string; status: QuestStatus; note: string }

/** 2d6 판정 결과: 10+ 강한 성공 · 7~9 약한 성공 · 6- 실패 */
export type Tier = 'strong' | 'weak' | 'miss'

/** 주사위 한 묶음: 3d6 이면 sides 6, values 셋 */
export type DiceGroup = { sides: number; values: number[] }

export type Roll = {
  id: number
  at: number
  who: string
  /** 기술 이름이나 굴린 까닭 */
  what: string
  /** "2d6+민첩+1" · "d8+1" */
  expr: string
  groups: DiceGroup[]
  mod: number
  total: number
  /** 2d6 판정일 때만 */
  tier?: Tier
  stat?: Stat
  /** 맞힌 대상과 실제로 깎인 HP(방어 뺀 값) */
  target?: string
  dealt?: number
  /** 패널 버튼으로 주인님이 굴렸으면 player */
  by: 'player' | 'gm'
}

/** GM 이 주인님께 굴려 달라고 한 판정 */
export type Ask = { move: string; stat?: Stat; bonus: number; who: string; why: string }

/** 이야기 탭의 한 덩이: GM 서술 또는 주인님의 행동 */
export type StoryLine = { at: number; who: 'gm' | 'player'; text: string }

/** 수첩: 캐릭터가 만난 사람(이름은 알게 된 뒤에만) */
export type Person = { name: string; who: string; met: string; notes: string[] }
/** 수첩: 캐릭터가 알게 된 것(단서 · 소문)과 누구에게서 */
export type Fact = { text: string; source: string; day: number }

export type LogKind = 'story' | 'roll' | 'loot' | 'hp' | 'quest' | 'system'
export type LogLine = { at: number; text: string; kind: LogKind }

export type Campaign = {
  version: 1
  name: string
  slug: string
  premise: string
  createdAt: number
  updatedAt: number
  party: Character[]
  scene: Scene
  quests: Quest[]
  rolls: Roll[]
  log: LogLine[]
  /** GM 만 아는 것(함정 위치 · 흑막 · 지도). 패널에 안 보인다 */
  secrets: string[]
  /** 패널에 버튼으로 띄울 선택지 */
  choices: string[]
  ask: Ask | null
  nextRollId: number
  clocks: Clock[]
  time: GameTime
  /** 패널 이야기 탭(최근 것만 남긴다) */
  story: StoryLine[]
  people: Person[]
  facts: Fact[]
}

export type SaveInfo = { slug: string; name: string; updatedAt: number; summary: string }

/** 패널의 주사위 굴러가는 그림: 끝나면 null */
export type Tumble = { rollId: number; frame: number; faces: number[] } | null

declare module 'claude-code' {
  interface PluginState {
    'clawd-trpg': {
      game: Campaign | null
      /** 패널이 열려 있는 동안이 "게임 중"(주인님 말에 상태를 붙이고 띠를 띄운다) */
      open: boolean
      saves: SaveInfo[]
      /** 캠페인을 만들기 전 시작 화면의 선택지(모험 실마리 고르기) */
      lobby: string[]
      tumble: Tumble
      savedAt: number
      problem: string
      showLog: boolean
      /** 지도를 선 그림 대신 원본 글자로 */
      plainMap: boolean
      /** 패널 탭: 이야기 · 지도 · 시트 */
      view: string
      /** 이야기 탭 입력칸에 쓰던 글 */
      draft: string
      /** 지도 확대: 0 은 패널 폭에 맞춰, 1 · 2 · 3(4배) */
      mapZoom: number
    }
  }
}
