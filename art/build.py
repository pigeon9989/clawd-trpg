# sprites.py → hooks/sprites.ts (그림판이 읽는 데이터)
import json, sys
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
import sprites
out = {k: [{'art': s['art'], 'mask': s['mask'], 'sx': s['sx'], 'sy': s['sy'], **({'label': list(s['label'])} if s['label'] else {})} for s in v] for k, v in sprites.SPRITES.items()}
# 큰 것부터
for k in out: out[k].sort(key=lambda s: -len(s['art'][0]) * len(s['art']))
print('// 손그림 아스키아트 스프라이트(그림판 데이터). 고치려면 이 파일 말고 art/sprites.py 를 고치고 `python3 art/build.py > hooks/sprites.ts` 로 다시 뽑는다.')
print('// art 는 글자, mask 는 색 키(art.ts 의 SPRITE_COLORS), sx · sy 는 늘일 열 · 줄, label 은 이름 글자 자리.')
print("export type Sprite = { art: string[]; mask: string[]; sx: number[]; sy: number[]; label?: [number, number] }")
print('export const SPRITES: Record<string, Sprite[]> = ' + json.dumps(out, ensure_ascii=False, indent=1))
