# Fitness Dashboard — SH Cut Phase

노션 DB → GitHub Pages 자동 동기화 대시보드.

## 셋업 (한 번만)

### 1. 이 폴더 내용을 저장소에 업로드

GitHub 웹에서:
- `fitness-dashboard` repo 열기
- 모든 파일/폴더를 그대로 업로드 (`index.html`, `styles.css`, `app.js`, `scripts/`, `.github/`, `data/`, `package.json`)

### 2. Notion Token을 Secrets에 등록

Repo → **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|------|-------|
| `NOTION_TOKEN` | 노션 integration 토큰 (`ntn_...`) |

### 3. GitHub Pages 활성화

**Settings → Pages**
- Source: **GitHub Actions**

### 4. 첫 동기화 실행

**Actions** 탭 → `Sync Notion → Dashboard` 워크플로우 선택 → **Run workflow**

1~2분 후 다음 URL에서 확인:
```
https://ako0906.github.io/fitness-dashboard/
```

## 작동 방식

- 매시간 정각에 노션 4개 DB에서 데이터 fetch
- `data/*.json`으로 정규화하여 저장
- GitHub Pages에 자동 배포

식사·운동을 노션에 기록 → 최대 1시간 내 반영. 즉시 보고 싶으면 Actions 탭에서 수동 실행.

## 노션 임베드 (선택)

노션 페이지에 `/embed` 블록 → 위 URL 붙여넣기.

## 데이터 구조

| 파일 | 출처 |
|------|------|
| `data/meals.json`    | 식단 DB |
| `data/workouts.json` | 운동 DB |
| `data/daily.json`    | Daily DB |
| `data/inbody.json`   | InBody DB |

스키마는 `scripts/fetch-notion.mjs` 의 `normalize*` 함수 참조.

## 트러블슈팅

**대시보드는 뜨는데 데이터가 안 보임**
→ Actions 탭에서 sync 워크플로우 실패 여부 확인. 토큰 잘못됐거나 노션 integration 연결이 안 됐을 가능성.

**한글 음식명이 깨짐**
→ 노션 원본 데이터의 문제. 노션에서 수정하면 다음 sync에 반영.

**속성명 매칭 안 됨**
→ `scripts/fetch-notion.mjs`의 `normalize*` 함수에서 실제 노션 속성명 추가.
