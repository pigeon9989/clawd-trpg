# 손그림 아스키아트 스프라이트(크기가 정해진 것: 나무 · 봉우리 · 우물 · 석상). 건물은 art.ts 의 생성기가 터 크기에 맞게 그린다.
# 색은 줄마다 역할 + 글자 규칙 + 몇 칸 덧칠로 정한다.
# 색 키: R 지붕 · r 지붕 그늘 · W 벽 · w 벽 그늘 · G 불 켜진 창 · D 문 · C 굴뚝 · S 연기 · E 불티 · B 돌 · b 돌 그늘
#        F 깃발 · Y 금빛 · T 잎 · t 잎 그늘 · K 줄기 · A 물 · M 바위 · m 바위 그늘 · N 눈 · L 이름 자리 · o 속(가림) · ' ' 투명
SPRITES = {}

def sp(name, art, rows, chars=None, patch=(), sx=(), sy=(), label=None, fill=True):
    w = max(len(l) for l in art)
    art = [l.ljust(w) for l in art]
    assert len(rows) == len(art), (name, len(rows), len(art))
    chars = chars or {}
    mask = []
    for r, line in enumerate(art):
        nz = [i for i, c in enumerate(line) if c != ' ']
        lo, hi = (nz[0], nz[-1]) if nz else (0, -1)
        m = []
        for x, c in enumerate(line):
            if c == ' ':
                m.append('o' if fill and lo < x < hi and rows[r] not in 'S' else ' ')
            else:
                m.append(chars.get(c, rows[r]))
        mask.append(m)
    for r, x0, x1, key in patch:
        for x in range(x0, x1 + 1):
            mask[r][x] = key
    if label:
        mask[label[0]][label[1]] = 'L'
    SPRITES.setdefault(name.split(':')[0], []).append({'art': art, 'mask': [''.join(m) for m in mask], 'sx': list(sx), 'sy': list(sy), 'label': label})

# ── 작은 것들 ──
sp('well:full', [" _|_ ", "|~~~|", "|___|"], "bBB", {'~': 'A'})
sp('statue:full', [" o ", "/|\\", "/ \\", "[_]"], "BBBb", fill=False)
sp('tree:big', ["   &&   ", " &&&&&& ", "  &&&&  ", "   ||   "], "TTtK", fill=False, patch=[(1, 5, 6, 't'), (2, 4, 5, 't')])
sp('tree:mid', ["  &&  ", " &&&& ", "  ||  "], "TtK", fill=False, patch=[(1, 3, 4, 't')])
sp('tree:small', [" && ", " || "], "TK", fill=False)
sp('peak:big', ["   /\\   ", "  /^^\\  ", " /    \\ ", "/      \\"], "NMMM", {'^': 'N'}, patch=[(0, 4, 4, 'm'), (1, 5, 5, 'm'), (2, 6, 6, 'm'), (3, 7, 7, 'm')], fill=False)
sp('peak:mid', ["  /\\  ", " /^^\\ ", "/    \\"], "NMM", {'^': 'N'}, patch=[(0, 3, 3, 'm'), (1, 4, 4, 'm'), (2, 5, 5, 'm')], fill=False)
sp('peak:small', [" /\\ ", "/^^\\"], "NM", {'^': 'N'}, patch=[(0, 2, 2, 'm'), (1, 3, 3, 'm')], fill=False)

