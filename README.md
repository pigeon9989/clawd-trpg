# clawd-trpg

Claude Code 에서 Claude 가 GM 을 맡는 2d6 판타지 TRPG mod. 화면 오른쪽 패널에 이야기 · 캐릭터 시트 · 수첩 · 지도 · 기록이 뜨고, 캠페인은 파일로 저장돼 다음 세션에 이어 한다.

규칙은 PbtA(Dungeon World) 식 2d6 판정이다. 10+ 강한 성공, 7–9 약한 성공, 6- 실패.

## 무엇이 들어 있나

- **패널** (`hooks/register.tsx`): 탭은 이야기 · 캐릭터 · 수첩 · 지도 · 기록이다.
  - 이야기 탭에서 선택지 버튼과 굴리기 버튼을 누르거나, 입력칸에 직접 행동을 쓴다.
  - 주사위 굴러가는 그림, 위협 시계, 하루 다섯 때(새벽 · 아침 · 낮 · 해 질 녘 · 밤)도 패널에 보인다.
- **GM 도구** `trpg_panel`: Claude 가 부르는 도구다.
  - 서술: `narrate`
  - 판정: `ask` · `roll` · `dice`
  - 상태: `scene` · `foe` · `clock` · `time` · `quest` · `character` · `change`
  - 수첩: `meet`(만난 사람) · `learn`(알게 된 것)
  - 세계 문서 읽기: `lore`
  - 주사위 숫자는 반드시 도구로 굴리게 해서, 모델이 지어내지 못하게 했다.
- **수첩**: 캐릭터가 실제로 알게 된 사람과 단서만 쌓인다. 아직 소개받지 않은 NPC 는 이름 대신 겉모습으로 부른다.
- **지도** (`hooks/world.ts`, `hooks/art.ts`, `hooks/sprites.ts`):
  - 세계 문서의 ASCII 지도를 안개 낀 채 띄우고, 들어간 방만 드러낸다.
  - 마을 지도는 건물 · 나무 · 우물을 아스키아트로 그려 준다.
  - 확대할 수 있다.
- **GM 스킬** (`skills/gm/SKILL.md`): 진행 규칙, 말투, 한 턴의 모양.
- **세계 「잿빛 변경」** (`world/`): 문서 28개.
  - 바이블, 규칙 5종(핵심 · 직업 · 주문 · 장비 · GM), 몬스터 도감, 무작위 표
  - 지역 13곳(지도 포함), 5장짜리 캠페인
  - 형식은 `world/format.md` 에 정리돼 있다.

> 백 년 전 떨어지던 검은 별을 막으려고 왕도의 시간을 멈췄다. 그 값은 변경 사람들의 시간이었다.

## 쓰는 법

1. 이 폴더를 Claude Code 플러그인으로 설치한다(마켓플레이스나 로컬 플러그인 경로).
2. 대화에서 "TRPG 하자" 같은 말을 하면 Claude 가 GM 스킬을 읽고 패널을 연다.
3. 캠페인은 `~/.local/share/clawd-deck/trpg/<이름>.json` 에 저장된다(`XDG_DATA_HOME` 을 따른다).

## 개발

```sh
# 테스트 (플러그인 폴더의 상위에서)
claude plugin test clawd-trpg

# 타입 검사 (Claude Code 가 tsconfig.json 을 깔아 주는 개발 사본에서)
npx -y -p typescript@5.6.3 tsc -p .

# 세계 문서 검사: 앵커 · 지도 형식 · 참조
python3 tools/check_world.py --all world

# 손그림 스프라이트 다시 뽑기
python3 art/build.py > hooks/sprites.ts
```
