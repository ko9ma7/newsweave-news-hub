# NewsWeave

**NewsWeave**는 특정 분야 하나에 묶이지 않는 개인 뉴스 수집·분류 웹서비스입니다. 세계, 경제, 기술, 과학, 건강, 기후, 우주, 문화, 스포츠, AI 등 원하는 분야를 `config/sources.json`에 설정하면 GitHub Actions가 RSS/Atom 또는 Google News RSS를 정기 수집하고, 브라우저에서는 검색·필터·규칙 기반 모음집으로 자동 정리합니다.

> Windows Bootstrap의 기본 저장소명은 `newsweave-news-hub`이며 `gh repo create`로 독립 저장소를 생성합니다.

<!-- BOOTSTRAP_DEPLOY_URL_START -->
**Deployment URL:** 아직 배포되지 않았습니다. `github-bootstrap.cmd` 실행 후 자동 갱신됩니다.
<!-- BOOTSTRAP_DEPLOY_URL_END -->

## Preview

- `index.html`: NewsWeave 소개, 활성 수집 분야와 자동화 파이프라인
- `collections.html`: 수집된 뉴스 검색, **카드 클릭 오버레이 상세 보기**, 카테고리 필터, 다중 선택 저장, 규칙 기반 자동 모음집, 활동 기록, JSON 백업/복원

## Features

- Google News RSS 검색과 일반 RSS/Atom 수집
- 분야별 카테고리 및 검색식 완전 설정형 구조
- 기본 분야: WORLD, ECONOMY, TECHNOLOGY, SCIENCE, HEALTH, CLIMATE, SPACE, CULTURE, SPORTS, AI
- 중복 제거 및 공통 JSON 스키마 정규화
- 정적 `data/catalog.json` 검색 인덱스
- 뉴스 카드 클릭 시 상세 오버레이(요약·출처·원문·모음집 저장)
- 카탈로그가 비어 있어도 표시되는 Quick Start 기본 카드
- 앱 안의 “수집 안내” 오버레이와 GitHub Actions/`sources.json` 바로가기
- 카테고리·키워드·출처 조건의 자동 모음집
- IndexedDB local-first 저장
- 외부 링크 직접 추가
- 활동 기록 및 JSON 백업/복원
- GitHub Actions 정기 수집 + GitHub Pages 자동 배포
- PWA 앱 셸, favicon, Open Graph, Twitter Card, sitemap, robots, 404
- Windows 원클릭 `github-bootstrap.cmd`

## Tech Stack

- HTML5 / CSS3 / Vanilla JavaScript
- Node.js 22 빌드·수집 스크립트
- IndexedDB
- RSS / Atom / Google News RSS
- GitHub Actions
- GitHub Pages
- GitHub CLI (`gh`) for Windows provisioning

## Project Structure

```text
newsweave/
├─ .github/
│  ├─ workflows/deploy.yml
│  └─ REPOSITORY_PROFILE.md
├─ assets/
│  ├─ collections.css
│  └─ collections.js
├─ config/
│  ├─ sources.json
│  └─ collections.json
├─ data/
│  ├─ external/
│  └─ catalog.json
├─ tools/
│  ├─ collect-sources.js
│  ├─ build-catalog.js
│  ├─ build-index.js
│  ├─ build-meta.js
│  ├─ serve.js
│  └─ smoke-test.js
├─ collections.html
├─ index.html
├─ service-worker.js
├─ site.webmanifest
├─ github-bootstrap.cmd
├─ github-diagnose.cmd
├─ .newsweave-project
└─ README.md
```

## Local Development

```bash
npm install
npm run build
npm run dev
```

기본 개발 주소는 `http://127.0.0.1:5173/`입니다.

외부 뉴스를 실제로 수집하고 다시 빌드하려면:

```bash
npm run update
```

수집기 자체 테스트:

```bash
npm run collect:test
```

## 카탈로그에 뉴스를 실제로 올리는 방법

배포 후 카드가 0건이면 저장소가 잘못된 것이 아니라 **첫 수집이 아직 실행되지 않았을 가능성**이 큽니다. 가장 빠른 방법은 GitHub에서 직접 Workflow를 실행하는 것입니다.

1. 저장소의 **Actions** 탭을 엽니다.
2. **Collect, Build and Deploy NewsWeave**를 선택합니다.
3. **Run workflow** → `main` → **Run workflow**를 누릅니다.
4. 성공하면 `data/external/YYYY-MM-DD.json`이 생성됩니다.
5. 같은 실행에서 `data/catalog.json`과 GitHub Pages도 다시 만들어집니다.
6. Pages를 새로고침하면 뉴스 카드가 나타납니다. 서비스워커 캐시가 남으면 `Ctrl+F5`를 사용하세요.

전체 점검표와 소스 예시는 [`CATALOG-GUIDE.md`](CATALOG-GUIDE.md)에 정리되어 있습니다. 웹앱에서도 상단의 **수집 안내** 버튼을 누르면 같은 흐름을 오버레이로 볼 수 있습니다.

## 원하는 분야 추가하기

`config/sources.json`의 `sources` 배열에 항목을 추가합니다.

### Google News RSS 검색

```json
{
  "id": "real-estate-google-news",
  "name": "부동산 · Google News",
  "enabled": true,
  "type": "google-news-rss",
  "query": "부동산 OR 주택 OR 아파트 OR 전세",
  "category": "REAL_ESTATE",
  "includeKeywords": [],
  "excludeKeywords": []
}
```

### 일반 RSS

```json
{
  "id": "my-industry-feed",
  "name": "산업 전문 RSS",
  "enabled": true,
  "type": "rss",
  "url": "https://example.com/feed.xml",
  "category": "INDUSTRY",
  "includeKeywords": ["공급망", "제조"],
  "excludeKeywords": []
}
```

새 카테고리를 Collections의 기본 선택지에도 항상 표시하고 싶다면 `config/collections.json`의 `categories` 배열에 같은 값을 추가하면 됩니다. 수집 결과에 실제 새 카테고리가 들어오면 앱에서도 자동 감지합니다.

## Build

```bash
npm ci
npm run build
npm run test:smoke
```

## GitHub Pages Deployment

`.github/workflows/deploy.yml`은 다음 흐름으로 동작합니다.

```text
push / manual / daily schedule
→ npm ci
→ collector self-test
→ configured RSS collection
→ catalog build
→ metadata build
→ smoke test
→ collected JSON commit
→ Pages artifact
→ deploy-pages
```

기본 스케줄은 매일 오전 08:00 KST입니다.

## Windows One-click GitHub Bootstrap

ZIP을 완전히 압축 해제한 뒤 **`newsweave` 폴더 안의 `github-bootstrap.cmd`**를 실행하세요. 단독으로 다른 폴더에 복사해 실행하지 마세요.

스크립트 기본값:

```cmd
set "REPO_NAME=newsweave-news-hub"
set "REPO_VISIBILITY=public"
set "DEFAULT_BRANCH=main"
set "INITIAL_TAG=v1.1.3"
```

자동 처리 항목:

1. `.newsweave-project`로 올바른 프로젝트 폴더인지 확인
2. Git / Node.js / npm / GitHub CLI 확인
3. GitHub CLI 로그인과 active account 확인
4. 필요 시 GitHub 브라우저 로그인 / 2FA
5. 로컬 Git 초기화 및 `main` 설정
6. active GitHub 계정 아래 `newsweave-news-hub` 존재 여부 확인
7. 없으면 `gh repo create`로 **새 저장소 생성**
8. GitHub API로 저장소 실존 재검증
9. dependency 설치, build, smoke test
10. commit / push
11. 원격 commit 재검증
12. Description / Homepage / Topics / `SITE_URL` 설정
13. GitHub Pages `workflow` source 활성화
14. Actions 실행 확인 및 `gh run watch --exit-status`
15. 성공 시 배포 URL 표시
16. `v1.1.3` tag / Release 생성

기존 origin이 요청한 새 저장소와 다르면 force-push하지 않고 중단합니다. 복구 명령은 화면과 `github-bootstrap.log`에 기록됩니다.

문제가 생기면 같은 폴더의 `github-diagnose.cmd`를 실행하세요.

## Repository Profile

- Name: `newsweave-news-hub`
- Description: `Multi-topic news collector and rule-based personal news collections for GitHub Pages`
- Visibility: public
- Branch: main
- Initial tag: v1.1.3
- Initial commit: `feat: launch NewsWeave multi-topic news collector`
- Topics: `news`, `news-aggregator`, `rss`, `github-pages`, `indexeddb`, `knowledge-management`, `automation`, `static-site`, `vanilla-javascript`

## Data Model

수집 결과는 `data/external/YYYY-MM-DD.json`에 날짜별로 저장되고, `npm run build:catalog`가 `data/catalog.json`을 생성합니다. 브라우저의 개인 모음집은 IndexedDB에 저장되므로 공개 저장소에 개인 분류 데이터가 자동 업로드되지는 않습니다.

## Security

- PAT, API key, password, private key를 코드나 `.cmd`에 넣지 않습니다.
- GitHub 인증은 `gh auth login`을 사용합니다.
- 외부 기사 링크는 `http/https`만 허용합니다.
- 민감 개인정보를 Git-backed 수집 데이터에 넣지 마세요.

## License

MIT License. 연결된 뉴스 기사와 각 출처의 콘텐츠 권리는 해당 권리자에게 있습니다.
