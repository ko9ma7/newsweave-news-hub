# NewsWeave 카탈로그 수집 가이드

NewsWeave의 뉴스 카드는 브라우저가 외부 사이트를 직접 긁어서 만드는 것이 아닙니다. **GitHub Actions가 RSS/Google News RSS를 수집 → 날짜별 JSON 저장 → `data/catalog.json` 생성 → GitHub Pages 재배포** 순서로 만들어집니다.

## 가장 빠르게 첫 뉴스를 표시하는 방법

1. GitHub 저장소에서 **Actions** 탭을 엽니다.
2. 왼쪽에서 **Collect, Build and Deploy NewsWeave**를 선택합니다.
3. 오른쪽의 **Run workflow**를 누릅니다.
4. branch는 `main` 그대로 두고 다시 **Run workflow**를 누릅니다.
5. 실행이 완료될 때까지 기다립니다. 녹색 체크가 표시되면 성공입니다.
6. 저장소의 `data/external/`에 날짜별 JSON이 생겼는지 확인합니다.
7. `data/catalog.json`의 `stats.totalItems`가 0보다 큰지 확인합니다.
8. Pages 화면을 새로고침합니다. 서비스워커 때문에 이전 화면이 남으면 한 번 강력 새로고침(Ctrl+F5)합니다.

## 수집 분야 변경하기

`config/sources.json`의 `sources` 배열이 실제 수집 설정입니다.

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

- `enabled`: `true`면 수집
- `type`: `google-news-rss` 또는 `rss`
- `query`: Google News RSS 검색어
- `category`: 카드에 표시하고 필터링할 카테고리
- `includeKeywords`: 결과 안에 반드시 포함시키고 싶은 단어
- `excludeKeywords`: 제외할 단어
- `maxItemsPerSource`: 소스별 최대 수집 수(개별 설정, 생략하면 defaults 사용)

일반 RSS는 `query` 대신 `url`을 사용합니다.

```json
{
  "id": "example-rss",
  "name": "내 RSS",
  "enabled": true,
  "type": "rss",
  "url": "https://example.com/feed.xml",
  "category": "MY_TOPIC",
  "includeKeywords": [],
  "excludeKeywords": []
}
```

## 수집 파일이 만들어지는 위치

```text
config/sources.json
      ↓
GitHub Actions / npm run collect
      ↓
data/external/YYYY-MM-DD.json
      ↓
npm run build:catalog
      ↓
data/catalog.json
      ↓
collections.html 뉴스 카드
```

## 로컬 PC에서 직접 시험하기

```bash
npm ci
npm run collect
npm run build
npm run dev
```

브라우저에서 `http://127.0.0.1:5173/collections.html`을 엽니다.

## 자동 수집 시간

`.github/workflows/deploy.yml`은 기본적으로 **매일 오전 08:00 KST**에 실행됩니다. 즉시 수집이 필요하면 스케줄을 기다리지 말고 Actions의 **Run workflow**를 사용하세요.

## 카드가 0건일 때 확인할 것

- Actions 실행이 성공했는가?
- Actions 로그의 `Collect configured news sources`에서 각 소스가 몇 건 수집됐는가?
- `data/external/`에 JSON 파일이 생성됐는가?
- `data/catalog.json`의 `stats.totalItems`가 증가했는가?
- Pages 배포 job까지 성공했는가?
- 브라우저에서 Ctrl+F5로 새로고침했는가?

수집기는 한 소스가 실패해도 기본적으로 다른 소스를 계속 처리합니다. 실제 실패 원인은 Actions의 `Collect configured news sources` 로그에 `✗ 소스명: 원인` 형태로 표시됩니다.
