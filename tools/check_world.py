#!/usr/bin/env python3
"""clawd-trpg 세계 문서 검사: 앵커 · 지도 형식(world/format.md) · 방 제목 · 참조.

  python3 tools/check_world.py <파일.md> [...]   # 파일마다
  python3 tools/check_world.py --all world        # 전체 + 파일 id 겹침 + 참조(→ id#앵커)
"""
import os
import re
import sys
from collections import deque

FOG_GLYPHS = set('#.+%<>~:=*$!" ') | set('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')
BLOCK = set('#+% ')
ANCHOR = re.compile(r'\{#([a-z0-9-]+)\}\s*$')
HEADING = re.compile(r'^(#{1,6})\s+(.*?)\s*$')
REF = re.compile(r'→\s*([a-z0-9-]+)#([a-z0-9-]+)')


def plain_lines(text):
    """~~~~ 보기 글은 지운다(``` 코드 블록 밖에서 딱 ~~~~ 일 때만)"""
    lines = text.split('\n')
    tilde = code = False
    for k, line in enumerate(lines):
        if not tilde and line.startswith('```'):
            code = not code
        if not code and re.match(r'^~~~~[a-z]*\s*$', line):
            tilde = not tilde
            lines[k] = ''
        elif tilde:
            lines[k] = ''
    return lines


def sections(lines):
    heads, code = [], False
    for i, line in enumerate(lines):
        if line.startswith('```'):
            code = not code
            continue
        if code:
            continue
        m = HEADING.match(line)
        if m:
            a = ANCHOR.search(m.group(2))
            heads.append((len(m.group(1)), m.group(2), a.group(1) if a else None, i))
    out = []
    for k, (lvl, title, anchor, start) in enumerate(heads):
        end = next((s for l2, _, _, s in heads[k + 1:] if l2 <= lvl), len(lines))
        out.append((lvl, title, anchor, start, end))
    return out


def regions(grid):
    h, w = len(grid), max((len(r) for r in grid), default=0)
    cells = [r.ljust(w) for r in grid]
    seen, comps = set(), []
    for y in range(h):
        for x in range(w):
            if cells[y][x] in BLOCK or (y, x) in seen:
                continue
            comp, q = [], deque([(y, x)])
            seen.add((y, x))
            while q:
                cy, cx = q.popleft()
                comp.append((cy, cx))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and (ny, nx) not in seen and cells[ny][nx] not in BLOCK:
                        seen.add((ny, nx))
                        q.append((ny, nx))
            comps.append(comp)
    return cells, comps


def check_file(path):
    errs = []
    lines = plain_lines(open(path, encoding='utf-8').read())
    secs = sections(lines)
    anchors = [s[2] for s in secs if s[2]]
    for a in sorted({a for a in anchors if anchors.count(a) > 1}):
        errs.append(f'앵커 겹침: {a}')
    if not secs or secs[0][0] != 1 or secs[0][2] != 'top':
        errs.append('맨 위 제목은 "# 제목 {#top}" 이어야 한다')
    for lvl, title, anchor, start, _ in secs:
        if lvl >= 2 and not anchor:
            errs.append(f'{start + 1}줄: 앵커 없는 제목: {title}')
    i = 0
    while i < len(lines):
        if lines[i].strip() in ('```map', '```map nofog'):
            nofog = lines[i].strip().endswith('nofog')
            j = i + 1
            while j < len(lines) and lines[j].strip() != '```':
                j += 1
            grid, where = lines[i + 1:j], f'{i + 1}줄 지도'
            if len(grid) > 30:
                errs.append(f'{where}: 높이 {len(grid)} > 30')
            for k, row in enumerate(grid):
                if len(row) > 60:
                    errs.append(f'{where}: {k + 1}째 줄 폭 {len(row)} > 60')
                bad = [c for c in row if not 32 <= ord(c) <= 126]
                if bad:
                    errs.append(f'{where}: {k + 1}째 줄에 ASCII 아닌 글자 {"".join(bad[:5])!r}')
            owner = None
            for s in secs:
                if s[0] == 2 and s[3] < i < s[4]:
                    owner = s
            if owner is None:
                errs.append(f'{where}: "##" 구역 안에 있어야 한다')
            if not nofog:
                for k, row in enumerate(grid):
                    odd = sorted({c for c in row if c not in FOG_GLYPHS})
                    if odd:
                        errs.append(f'{where}: {k + 1}째 줄에 안개 지도에 없는 글자 {"".join(odd)!r}')
                cells, comps = regions(grid)
                used = {}
                for comp in comps:
                    labels = [cells[y][x] for y, x in comp if cells[y][x].isalnum()]
                    if len(labels) != 1:
                        y, x = comp[0]
                        errs.append(f'{where}: ({y + 1}줄 {x + 1}칸) 구역의 표지가 {len(labels)}개 {"".join(labels)!r}')
                    for lab in labels:
                        used[lab] = used.get(lab, 0) + 1
                for lab, n in used.items():
                    if n > 1:
                        errs.append(f'{where}: 표지 {lab!r} 가 {n}번')
                if owner:
                    rooms = set()
                    for s in secs:
                        if s[0] == 3 and owner[3] < s[3] < owner[4]:
                            m = re.match(r'^([0-9A-Z])\.\s', s[1])
                            if m:
                                rooms.add(m.group(1))
                    for lab in sorted(used):
                        if (lab.isdigit() or lab.isupper()) and lab not in rooms:
                            errs.append(f'{where}: 방 표지 {lab!r} 의 "### {lab}. 이름" 제목이 없다')
                    for lab in sorted(rooms - set(used)):
                        errs.append(f'{where}: "### {lab}." 제목은 있는데 지도에 표지가 없다')
            i = j
        i += 1
    return errs


def main(argv):
    if argv[:1] == ['--all']:
        root = argv[1]
        files = [os.path.join(d, n) for d, _, names in os.walk(root) for n in names if n.endswith('.md')]
        ids, anchors, total = {}, {}, 0
        for f in sorted(files):
            fid = os.path.basename(f)[:-3]
            ids.setdefault(fid, []).append(f)
            anchors[fid] = set(re.findall(r'\{#([a-z0-9-]+)\}', open(f, encoding='utf-8').read()))
            for e in check_file(f):
                print(f'{os.path.relpath(f, root)}: {e}')
                total += 1
        for fid, fs in ids.items():
            if len(fs) > 1:
                print(f'파일 id 겹침: {fid}: {fs}')
                total += 1
        for f in sorted(files):
            for fid, anchor in REF.findall(open(f, encoding='utf-8').read()):
                if fid not in anchors or anchor not in anchors[fid]:
                    print(f'{os.path.relpath(f, root)}: 참조할 {"파일" if fid not in anchors else "앵커"} 없음 → {fid}#{anchor}')
                    total += 1
        print(f'{len(files)}개 파일, 문제 {total}개')
        return 1 if total else 0
    bad = 0
    for f in argv:
        errs = check_file(f)
        for e in errs:
            print(f'{f}: {e}')
        bad += len(errs)
        if not errs:
            print(f'{f}: 문제 없음')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
