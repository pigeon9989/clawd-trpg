// 손그림 아스키아트 스프라이트(그림판 데이터). 고치려면 이 파일 말고 art/sprites.py 를 고치고 `python3 art/build.py > hooks/sprites.ts` 로 다시 뽑는다.
// art 는 글자, mask 는 색 키(art.ts 의 SPRITE_COLORS), sx · sy 는 늘일 열 · 줄, label 은 이름 글자 자리.
export type Sprite = { art: string[]; mask: string[]; sx: number[]; sy: number[]; label?: [number, number] }
export const SPRITES: Record<string, Sprite[]> = {
 "well": [
  {
   "art": [
    " _|_ ",
    "|~~~|",
    "|___|"
   ],
   "mask": [
    " bbb ",
    "BAAAB",
    "BBBBB"
   ],
   "sx": [],
   "sy": []
  }
 ],
 "statue": [
  {
   "art": [
    " o ",
    "/|\\",
    "/ \\",
    "[_]"
   ],
   "mask": [
    " B ",
    "BBB",
    "B B",
    "bbb"
   ],
   "sx": [],
   "sy": []
  }
 ],
 "tree": [
  {
   "art": [
    "   &&   ",
    " &&&&&& ",
    "  &&&&  ",
    "   ||   "
   ],
   "mask": [
    "   TT   ",
    " TTTTtt ",
    "  tttt  ",
    "   KK   "
   ],
   "sx": [],
   "sy": []
  },
  {
   "art": [
    "  &&  ",
    " &&&& ",
    "  ||  "
   ],
   "mask": [
    "  TT  ",
    " tttt ",
    "  KK  "
   ],
   "sx": [],
   "sy": []
  },
  {
   "art": [
    " && ",
    " || "
   ],
   "mask": [
    " TT ",
    " KK "
   ],
   "sx": [],
   "sy": []
  }
 ],
 "peak": [
  {
   "art": [
    "   /\\   ",
    "  /^^\\  ",
    " /    \\ ",
    "/      \\"
   ],
   "mask": [
    "   Nm   ",
    "  MNNm  ",
    " M    m ",
    "M      m"
   ],
   "sx": [],
   "sy": []
  },
  {
   "art": [
    "  /\\  ",
    " /^^\\ ",
    "/    \\"
   ],
   "mask": [
    "  Nm  ",
    " MNNm ",
    "M    m"
   ],
   "sx": [],
   "sy": []
  },
  {
   "art": [
    " /\\ ",
    "/^^\\"
   ],
   "mask": [
    " Nm ",
    "MNNm"
   ],
   "sx": [],
   "sy": []
  }
 ]
}
