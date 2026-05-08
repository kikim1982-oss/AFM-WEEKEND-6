# AFM 부트캠프 2기 (기초반: 주말) — 모노레포

AI 공장장 부트캠프 2기 주말반 퀘스트들을 한 저장소에 묶어 둔 작업 공간입니다.
각 폴더는 독립 프로젝트(`npm install` 후 자체 실행)이며, 공통 Postgres(Supabase)를 테이블 prefix 로 분리해서 공유합니다.

```
AFM-WEEKEND-6/
├── Q1-my-ecommerce/      → 도자기 이커머스 (Vercel 배포 완료)
├── Q2-MCP-research/      → MCP 서버 조사 자료
├── Q3-My-personal-project-ERP/  → 우진산업 ERP 구축 컨설팅 기록
├── Q4-payme-content/     → 유료 콘텐츠 잠금해제 미니앱 (Vercel 배포 완료)
├── Q5-carrot-repl/       → 당근마켓 클론 (단계 7/8 진행 중)
└── image-upload-test/    → ImageKit 업로드 검증용 미니 샌드박스
```

---

## Q1 — 도자기 이커머스 (`dalhangari`)

> **퀘스트**: 5주차 쇼핑몰에 **이미지 업로드 + 결제 + 마이페이지** 를 붙여 진짜 서비스로 완성. ([PAYMENT-FILE-MISSION.md](./Q1-my-ecommerce/PAYMENT-FILE-MISSION.md))

### 결과물
- 관리자 상품 등록 → ImageKit 업로드 → 상품 목록에 실제 이미지 표시
- 장바구니 → 토스 결제 위젯 → 서버 confirm API → `orders` / `order_items` 저장
- 마이페이지 주문 내역 (본인 `user_id` 만 조회)
- Vercel 배포 완료

### 스택
- Express 5 + Postgres(`pg`) + JWT(`jsonwebtoken`) + bcryptjs
- ImageKit JS SDK (이미지 호스팅)
- TossPayments 위젯 v2 + 서버 confirm
- Vanilla JS + `vercel.json` SPA 폴백

### 스크린샷 (`Q1-my-ecommerce/screenshots/`)
- 01 home / 02 cart / 03 checkout / 04 마이페이지 주문 / 05 결제확인 / 06 마이페이지 내역

### Q5 에 재활용된 자산
- ImageKit 키 + `/api/imagekit-auth` 패턴 → Q5 `/api/imagekit-auth` 그대로 이식
- 도자기 상품 사진 8장(`dalhangari/products/product-1~6_*.jpg`) → Q5 시드 데이터로 재사용

---

## Q2 — MCP 연구

`Q2-MCP-research/sites/` 에 조사 자료. (별도 앱 미구현)

---

## Q3 — 우진산업 ERP

> **퀘스트**: 가족 기업(우진산업, 제지 케미컬) ERP 자체 구축 — 2년 로드맵으로 회계 담당자의 도메인 지식을 시스템으로 옮겨담기. ([MISSION.md](./Q3-My-personal-project-ERP/MISSION.md))

이 폴더는 v1 (매입 모듈) 본격 개발 전 **컨설팅 기록**(`consulting-log.md`) + **미션 정의서**(`MISSION.md`) + **개발 계획**(`DEV.md`) 단계.

---

## Q4 — 유료 콘텐츠 잠금해제 미니앱 (`payme-content`)

> **퀘스트**: 토스페이먼츠로 유료 콘텐츠 잠금 해제 — 결제한 사람만 본문/PDF 열람. ([quest4.md](./Q4-payme-content/quest4.md))

### 결과물
- 콘텐츠 23건 시드 (주식 리포트 PDF, 카테고리/티커/가격)
- 잠금 화면(미리보기 3줄 + 가격) → 토스 결제 위젯 → 결제 승인
- `purchases` 테이블에 `(user_id, content_id)` 저장 + UNIQUE 가드 (이중결제 차단)
- Supabase Storage 에 실제 PDF 업로드, 결제자에게만 **1분짜리 signed URL** 발급
- 마이페이지 구매 이력 (`/api/purchases`)
- Vercel 배포 완료

### 스택
- Express 4 + Postgres(`pg`) + JWT + bcryptjs + cors + dotenv
- TossPayments 위젯 v2 SDK (`@js.tosspayments.com/v2/standard`) + 서버 `/api/payments/confirm` (Basic auth, 멱등 처리)
- Supabase Storage REST (`/storage/v1/object/sign`) — service_role 키로 단기 signed URL 발급
- React 18 (Babel standalone, CDN) + Tailwind CDN — 단일 `index.html`
- `api/index.js` + `vercel.json` (Vercel serverless 진입점)

### 스크린샷 (`Q4-payme-content/screenshots/`)
- 01 login / 02 register / 03 home / 04 content-locked / 05 checkout / 06 content-unlocked / 07 my-purchases / 08 home-after-purchase

### Q5 에 재활용된 자산
- Express + JWT + bcrypt + pg 부트스트랩 → Q5 `server.js` 의 auth 부분 거의 그대로
- TossPayments 결제 흐름 (`/api/orders` → 위젯 → `/api/payments/confirm`) → Q5 단계 7 패턴
- `vercel.json` + `api/index.js` 진입점 패턴 → Q5 단계 8 예정

---

## Q5 — 당근마켓 클론 (`carrot-repl`)

> **퀘스트**: 당근마켓 클론 — Auth + 상품 + 이미지 + 1:1 채팅 + 동네 기반 거래. ([quest.md](./Q5-carrot-repl/quest.md), [PLAN.md](./Q5-carrot-repl/PLAN.md))

### 진행 상황 — 8 단계 모두 완료
| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | UI 골격 + hash 라우팅 SPA (mock) | ✅ |
| 2 | Auth (가입/로그인 + 동네 2택) | ✅ |
| 3 | 상품 등록 + ImageKit 업로드 | ✅ |
| 4 | 목록/검색/상세 + 관심(❤️) DB 연동 + 동네 토글 | ✅ |
| 5 | 채팅 polling (3초 증분) + 양방향 검증 | ✅ |
| 6 | 마이페이지 (단계 4-5 안에서 자동 완성) | ✅ |
| 7 | TossPayments 결제 → SOLD 전환 | ✅ |
| 8 | Vercel 배포 → https://q5-carrot-repl.vercel.app | ✅ |

### 스택
- Node 24 + Express 4 + Postgres (`cm_*` prefix) + JWT + bcryptjs
- ImageKit JS SDK v4 (CDN) — 토큰 1회용 (파일마다 `/api/imagekit-auth` 재호출)
- TossPayments 위젯 v2 SDK
- 단일 `index.html` Vanilla JS + Tailwind CDN, hash 라우팅, 부분 DOM 패치 패턴

### DB 스키마 (모두 `cm_` prefix — Q1/Q4 와 분리)
- `cm_users(id UUID, email, password_hash, nickname, neighborhood)`
- `cm_listings(id, seller_id, title, price, description, category, neighborhood, image_urls TEXT[], status, buyer_id, paid_at, payment_key UNIQUE, order_id UNIQUE)`
- `cm_favorites(user_id, listing_id, created_at)` PK = (user_id, listing_id)
- `cm_messages(id, listing_id, sender_id, receiver_id, body, created_at)`

### 검증 메모 (단계별 체크포인트 모두 통과)
- 시드 사용자 2명 + 상품 8건, 단계 진행 중 추가 데이터 누적
- ImageKit 토큰은 1회용 — 파일별로 `/api/imagekit-auth` 매번 호출
- hash 라우터 path 매칭 시 query string 분리 필요 (`currentPath()` 에서 `?` cut)
- 결제 위젯 렌더 후엔 절대 `render()` 재호출 X (슬롯 DOM 통째로 날아감)
- 토스 redirect 시 `successUrl` query 가 `location.search` 와 `location.hash` 양쪽으로 분산 — 둘 다 통합 파싱

### 스크린샷 (`Q5-carrot-repl/screenshots/`)
- step2-home / step3-home / step4-detail-3img / step5-chat-A / step5-chat-B / step7-payment-page / step7-home-sold / step8-vercel-prod

---

## 공통 인프라

### Postgres (Supabase Pooler)
- 단일 프로젝트(`ppryvkjvzshvvadwoiou.supabase.co`) DB 를 모든 Q 가 공유.
- 테이블 prefix 로 충돌 회피:
  - Q1: `users`, `products`, `orders`, `order_items` (별도 schema)
  - Q4: `users`, `contents`, `purchases`
  - Q5: `cm_users`, `cm_listings`, `cm_favorites`, `cm_messages`

### 환경변수
각 폴더 `.env` 는 git ignore. `.env.example` 만 커밋.
공통: `PG*`, `JWT_SECRET`, `JWT_EXPIRES_IN`. 도구별: `IMAGEKIT_*`, `TOSS_*`, `SUPABASE_URL` / `SUPABASE_SERVICE_KEY`.

### Vercel 배포
- Q1: 도자기 이커머스 (배포 완료)
- Q4: 유료 콘텐츠 (배포 완료)
- Q5: https://q5-carrot-repl.vercel.app — `vercel.json` + `api/index.js` Q4 패턴 그대로 이식
  - `vercel link --project q5-carrot-repl` → env 14종 푸시 (production/preview/development) → `vercel deploy --prod`
