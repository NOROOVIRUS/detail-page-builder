# 상세페이지 빌더

600×1050 블록 40장 = **42,000px** 상세페이지를 자동 생성하는 단일 파일 웹앱.
서버·DB·계정 없이 브라우저에서 바로 동작합니다.

**접속 주소 → https://noroovirus.github.io/detail-page-builder/**

데스크탑·노트북 어디서든 같은 주소로 접속하면 됩니다.

---

## 무엇을 하는 앱인가

제품명과 소구점 4개를 입력하면 상세페이지 40블록이 자동으로 만들어집니다.

```
히어로 → 문제제기(환경·증상·대안 실패) → 전환 → 해결 제시
→ 소구점 인덱스 → POINT 1~4 (각 메인+상세+감성)
→ 감성 브레이크 → GIF → 테크 → 감성 → GIF
→ 디테일 → 인증서 → 후기 → 구성품 → 스펙
→ 사용법/관리법 → 구매 안내 → CTA×2 → 푸터
```

**가이드(순서·카피 공식)는 고정, 표면만 교체**하는 구조입니다.

| 축 | 선택지 |
|---|---|
| 팔레트 | Mint / Cream / Sand / Blush / Sky / Mono |
| 컴포넌트 | 동그라미 / 네모 / 리본 / 태그 / 숫자만 |

---

## 사용법

### 1. 기본
1. 주소에 접속
2. 왼쪽에서 제품명·소구점 4개 입력
3. 팔레트와 컴포넌트 선택
4. 이미지 슬롯에 사진 업로드
5. **HTML 내보내기** → 완성된 상세페이지 파일 다운로드

### 2. 캔버스에서 직접 편집 (디자인 툴)

미리보기 위에서 요소를 직접 조작할 수 있습니다.

| 하고 싶은 것 | 방법 |
|---|---|
| 선택 | 요소 클릭 |
| 글자 수정 | **더블클릭** 후 입력 (Enter로 종료, Shift+Enter 줄바꿈) |
| 위치 이동 | 선택 후 **드래그**, 또는 방향키 (Shift+방향키 = 10px) |
| 크기 조절 | 하단 툴바 **크기 − / +** |
| 정렬 | 하단 툴바 **좌 / 중 / 우** |
| 레이어 순서 | 하단 툴바 **앞 / 뒤** (텍스트를 이미지 뒤로 보내기) |
| 글자색 | 기본 / 검정 / 흰색 / 강조 / 회색 |
| 사진 넣기 | **이미지를 클릭** → 툴바 "사진 넣기" |
| 사진 맞춤 | 채우기(cover) / 맞추기(contain) |
| 사진 확대·이동 | 툴바 확대 − / +, 위치 ↑←→↓ |
| 사진 범위 | **이 슬롯 전체에 적용** → 같은 슬롯을 쓰는 모든 블록에 반영 |
| 되돌리기 | 툴바 "이 요소 초기화" 또는 상단 "텍스트 초기화" |

> 사진은 **블록마다 개별로** 넣을 수 있습니다. 페이지 전체에 같은 사진을 쓰고 싶으면
> 한 블록에 넣은 뒤 "이 슬롯 전체에 적용"을 누르세요.

### 3. 저장
- **자동 저장**: 입력값·테마는 브라우저에 자동 저장됩니다. 새로고침해도 유지.
- **프로젝트 저장**: JSON 파일로 내려받아 다른 기기로 옮길 수 있습니다.
- **불러오기**: 저장한 JSON을 그대로 복원.
- ⚠️ 업로드한 **이미지는 저장되지 않습니다.** 기기를 옮기면 사진은 다시 올려야 합니다.

### 4. 이미지 생성 (선택)
이미지를 직접 만들려면 Codex CLI를 씁니다. **API 키 없이 구독 계정으로 생성되므로 추가 과금이 없습니다.**

```bash
# 1) 빌더에서 "프롬프트 JSON" 버튼 → image-prompts.json 다운로드
# 2) 아래 실행 (Codex CLI 설치 + 로그인 필요)
node scripts/gen-images.mjs image-prompts.json

# 슬롯 골라서 생성
node scripts/gen-images.mjs image-prompts.json --only A,B
```

생성된 PNG는 `images/` 폴더에 저장됩니다. 빌더의 해당 슬롯에 업로드하세요.

**전제 조건**
- Node.js 22 이상
- Codex CLI 설치 + ChatGPT 계정 로그인 (`~/.codex/auth.json` 의 `auth_mode` 가 `chatgpt`)
- Codex 경로가 다르면 `CODEX_BIN` 환경변수로 지정

---

## 업데이트 방법

빌더를 고친 뒤 이 저장소에 push하면 1~2분 내 반영됩니다.

```bash
git add .
git commit -m "Update builder"
git push
```

로컬에서 파일만 열어도 동작합니다 (`index.html` 단일 파일, 의존성 0).

---

## Cloudflare Pages 로 옮기기 (선택)

GitHub Pages 대신 Cloudflare를 쓰고 싶다면:

1. Cloudflare 대시보드 → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 이 저장소(`detail-page-builder`) 선택
3. 빌드 설정:
   - Framework preset: **None**
   - Build command: *(비워둠)*
   - Build output directory: `/`
4. **Save and Deploy**

이후 `git push` 할 때마다 Cloudflare가 자동 배포합니다.
커스텀 도메인도 Cloudflare 쪽에서 바로 붙일 수 있습니다.

> CLI로 직접 올리려면 `npx wrangler pages deploy . --project-name detail-page-builder`
> (최초 1회 브라우저 로그인 필요)

---

## 구조

```
index.html              빌더 본체 (단일 파일, 의존성 없음)
scripts/gen-images.mjs  프롬프트 JSON → Codex CLI 일괄 생성
.nojekyll               GitHub Pages Jekyll 비활성화
```

## 제약

- 서버가 없으므로 **기기 간 실시간 동기화는 지원하지 않습니다.** 기기 이동은 프로젝트 JSON으로 합니다.
- 이미지 생성은 로컬 Codex CLI에서만 동작합니다. 웹사이트 자체는 이미지를 생성하지 않습니다.
- 내보낸 HTML은 600px 고정 폭이며, 640px 이하에서만 반응형으로 축소됩니다.
