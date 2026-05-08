# Q5 — 당근마켓 클론 (carrot-repl) 실행 계획

> 프로토타입. **속도 > 완벽함.** Q1(이커머스) · Q4(유료콘텐츠) 코드를 최대한 재활용한다.

---

## 0. 핵심 결정 (재활용 전략)

| 항목 | 어디서 가져올지 | 왜 |
|---|---|---|
| Express + JWT + bcrypt + pg 부트스트랩 | `Q4-payme-content/server.js` | 그대로 복붙 → 커스터마이즈 |
| ImageKit 업로드 (서명 발급) | `Q1-my-ecommerce/server.js` 의 `/api/imagekit-auth` | 도자기 이미지 자산도 재사용 |
| TossPayments 결제 승인 | `Q4-payme-content/server.js` 의 `/api/orders` + `/api/payments/confirm` | 동일 패턴 |
| Vercel 배포 (api/index.js + vercel.json) | `Q4-payme-content/api/index.js` | 1:1 |
| 단일 `index.html` SPA + hash 라우팅 | Q4 | 한 파일에 다 넣음 |

**스택**: Node + Express + Postgres(Supabase) + Vanilla JS + Tailwind CDN. **빌드 도구 없음.**

---

## 1. DB 스키마 — 4개 테이블, 모두 `cm_` 프리픽스 (기존 충돌 회피)

기존 `users`, `products`, `purchases`, `categories` 등과 부딪히지 않게 **`cm_`** (carrot-market) 접두사 고정.

```sql
-- cm_users — Q4 users 와 분리. 닉네임 + 동네 추가
CREATE TABLE cm_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname TEXT NOT NULL,
  neighborhood TEXT NOT NULL CHECK (neighborhood IN ('망원동','연남동')),  -- 프로토타입: 2개
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- cm_listings — image_urls 를 TEXT[] 로 인라인 (별도 이미지 테이블 생략)
CREATE TABLE cm_listings (
  id SERIAL PRIMARY KEY,
  seller_id UUID NOT NULL REFERENCES cm_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 0),
  description TEXT NOT NULL,
  category TEXT NOT NULL,                      -- '도자기','생활용품','전자기기','의류','기타'
  neighborhood TEXT NOT NULL,                  -- 등록자 동네 자동 복사
  image_urls TEXT[] NOT NULL DEFAULT '{}',     -- 최대 3개
  status TEXT NOT NULL DEFAULT 'ON_SALE',      -- ON_SALE / RESERVED / SOLD
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cm_listings_recent ON cm_listings(created_at DESC);
CREATE INDEX idx_cm_listings_category ON cm_listings(category);

-- cm_favorites — 관심 목록
CREATE TABLE cm_favorites (
  user_id UUID REFERENCES cm_users(id) ON DELETE CASCADE,
  listing_id INTEGER REFERENCES cm_listings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, listing_id)
);

-- cm_messages — 1:1 채팅 (listing_id + 두 user 가 대화방 키)
CREATE TABLE cm_messages (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES cm_listings(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES cm_users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES cm_users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cm_msg_room ON cm_messages(listing_id, sender_id, receiver_id, created_at);
```

**왜 4개로 충분한가**
- 별도 `cm_categories` ❌ → 카테고리는 5개 고정 enum (서버 상수)
- 별도 `cm_listing_images` ❌ → `TEXT[]` 컬럼으로 인라인 (최대 3장)
- 별도 `cm_conversations` ❌ → `(listing_id, sender_id, receiver_id)` 조합으로 가상 룸
- 결제 테이블은 **선택** — 프로토타입은 결제 성공 시 `cm_listings.status='SOLD'` 만 갱신해도 됨. 영수증 필요하면 `cm_listings`에 `paid_at`, `payment_key` 두 컬럼만 추가 (테이블 안 늘림)

---

## 2. 7단계 실행 순서 (요청하신 순서 그대로)

각 단계 끝에 **로컬 서버에서 직접 동작 확인** 후 다음 단계로.

### 단계 1 — UI 골격 먼저 (목업, 백엔드 없음)
**산출물**: `index.html` 하나에 hash 라우팅 SPA
- 라우트: `#/`(홈/목록) · `#/login` · `#/signup` · `#/new`(등록) · `#/listing/:id` · `#/chat/:listingId/:peerId` · `#/me`
- 데이터는 전부 **하드코딩 mock 배열** (도자기 이미지 URL 8~10개 미리 박아둠)
- Tailwind CDN, 색상은 당근스러운 주황 `#FF6F0F`
- `server.js`: Express 가 정적파일만 서빙 (`express.static(__dirname)`)
- ✅ **체크포인트**: `npm start` → `http://localhost:3000` 접속 → 모든 화면이 mock 데이터로 보임

### 단계 2 — Auth (가입/로그인 + 동네 2택)
- `setup-db.js`: `cm_users` 테이블만 우선 생성 + 시드 2명 (망원동/연남동 각 1명)
- API: `/api/auth/register` · `/login` · `/me` (Q4 server.js 그대로 복붙 → 테이블명만 `cm_users`로)
- 가입 폼: 이메일 + 비번(8자리 숫자, Q4 검증 재사용) + 닉네임 + **동네 라디오 (망원동/연남동)**
- 토큰 → `localStorage.token`, 이후 모든 API에 `Authorization: Bearer ...`
- ✅ **체크포인트**: 두 명 가입 → 로그인 → 헤더에 `닉네임 · 동네` 표시

### 단계 3 — 상품 등록 + ImageKit (도자기 이미지 재사용)
- DB: `cm_listings` 추가 마이그레이션
- API: `GET /api/imagekit-auth` (Q1 패턴) → 클라이언트에서 ImageKit Upload SDK로 직접 업로드
- 등록 폼: 제목 + 가격 + 설명 + 카테고리 select + 이미지 업로드(최대 3장, 파일별 progress)
- 이미지 URL 은 ImageKit 의 `url` 그대로 `cm_listings.image_urls[]` 에 저장
- 동네는 **로그인 사용자 동네 자동 복사**
- 본인 글만 수정/삭제: `WHERE seller_id = $userId` 가드 (RLS 대신 서버 쿼리에서 처리 — 단순 JWT 인증 모델)
- 시드 데이터로 Q1 의 도자기 ImageKit URL 8개를 두 시드 유저에게 분배
- ✅ **체크포인트**: 사진 3장 업로드 → 목록에 새 글 표시

### 단계 4 — 목록 + 검색 + 상세
- `GET /api/listings?q=&category=&neighborhood=&sort=recent`
  - `q`: `title ILIKE '%q%' OR description ILIKE '%q%'`
  - `category`: equality
  - `neighborhood`: 본인 동네만 / 전체 토글
- `GET /api/listings/:id` → 상세 + 작성자 닉네임
- 상세 페이지: 이미지 좌우 슬라이드(인덱스 state) + "관심" 토글(`POST/DELETE /api/favorites/:id`) + "채팅하기" 버튼
- ✅ **체크포인트**: 카테고리 + 검색어 조합 필터 동작, 관심 하트 토글 영구 저장

### 단계 5 — 채팅 (polling)
- API:
  - `POST /api/messages` `{listingId, receiverId, body}`
  - `GET /api/messages?listingId=&peerId=` → 대화 메시지 시간순
  - `GET /api/conversations` → 내가 참여한 모든 대화방 목록 (DISTINCT `(listing_id, peer_id)`)
- 채팅 화면: 3초 polling (`setInterval` + 마지막 메시지 id 기억해서 증분만 추가)
- ✅ **체크포인트**: 두 브라우저(혹은 시크릿)로 동시 로그인 → 한쪽이 보내면 3초 안에 반대쪽에 표시

### 단계 6 — 마이페이지
- `GET /api/me/listings` (내 상품)
- `GET /api/me/favorites` (관심)
- `GET /api/me/conversations` (단계 5 재사용)
- 단일 페이지 3개 탭
- ✅ **체크포인트**: 등록한 글, 관심한 글, 채팅한 상대 다 노출

### 단계 7 — TossPayments 결제 (구매 확정)
- 상세 페이지에 "구매하기" 버튼 (단, **본인 글에는 안 보임**, `status != 'ON_SALE'` 이면 비활성)
- 흐름: Q4 와 동일
  1. `POST /api/orders` → 서버가 `cm_listings.price` 기준 `orderId/amount` 발급 (위변조 차단)
  2. 결제 위젯 → 토스 결제창 → 성공 시 `successUrl=#/payment/success`
  3. `POST /api/payments/confirm` → 토스 confirm API + `cm_listings.status='SOLD'` 갱신 (멱등)
- **이 단계는 `tosspayments-widget-integrator` 에이전트에 위임**해서 위젯 v2 SDK 통합 정확하게 가져오기
- 동일 상품에 두 번 결제 막기: `cm_listings.status` UNIQUE 가드 + 서버에서 status 체크
- ✅ **체크포인트**: 테스트 결제(가상계좌/카드 테스트) → 상태 SOLD 전환 → 다른 사람이 못 사도록 버튼 사라짐

### 단계 8 — Vercel 배포
- `vercel.json` + `api/index.js` Q4 그대로 복사
- Vercel 프로젝트 새로 생성: `q5-carrot-repl`
- env: `PG*`, `JWT_SECRET`, `IMAGEKIT_*`, `TOSS_*` 5종 (`Q1` + `Q4` env 합본)
- 배포 → URL 획득 → 시연영상 + 1명 가입 인증

---

## 3. 디렉토리 (최종 모양)

```
Q5-carrot-repl/
├── api/
│   └── index.js              # Vercel 진입점 (require ../server.js)
├── server.js                 # 단일 Express 앱
├── index.html                # 단일 SPA (Vanilla JS + Tailwind CDN)
├── setup-db.js               # cm_* 4개 테이블 마이그레이션 + 시드
├── package.json
├── vercel.json
├── .env.example
├── quest.md                  # (이미 있음)
└── PLAN.md                   # (이 파일)
```

**파일 수 12개. node_modules 빼고 끝.**

---

## 4. 환경변수 (.env)

```
# Supabase Postgres (Q4 와 동일 DB 사용 — 테이블명만 분리)
PGHOST=...
PGPORT=...
PGUSER=...
PGPASSWORD=...
PGDATABASE=...

# JWT
JWT_SECRET=...
JWT_EXPIRES_IN=7d

# ImageKit (Q1 키 재사용 가능)
IMAGEKIT_PUBLIC_KEY=...
IMAGEKIT_PRIVATE_KEY=...
IMAGEKIT_URL_ENDPOINT=...

# TossPayments (테스트 키)
TOSS_CLIENT_KEY=test_gck_...
TOSS_SECRET_KEY=test_gsk_...

PORT=3001
```

---

## 5. 시간 견적 (혼자 작업 가정)

| 단계 | 예상 |
|---|---|
| 1. UI 목업 | 60~90분 |
| 2. Auth | 30분 (Q4 복사) |
| 3. 상품 등록 + 이미지 | 60분 |
| 4. 목록/검색/상세 | 45분 |
| 5. 채팅 polling | 60~90분 (가장 까다로움) |
| 6. 마이페이지 | 30분 |
| 7. TossPayments | 45분 (에이전트 위임) |
| 8. Vercel 배포 | 30분 |
| **합계** | **약 6~7시간** |

---

## 6. 리스크 & 회피

- **채팅에서 시간 빼앗김** → polling 단순 구현, 안 되면 "최근 10개만 + 새로고침 버튼"으로 후퇴
- **이미지 업로드 실패** → ImageKit 인증 실패가 가장 흔함, `/api/imagekit-auth` 200 응답 먼저 확인
- **Vercel 배포 시 PG 연결 실패** → SSL 옵션(`rejectUnauthorized:false`) Q4 그대로 가져갈 것
- **테이블명 충돌** → 모든 SQL 에 `cm_` 프리픽스, 절대 `users`/`products` 단독으로 안 씀

---

## 7. "사람 1명 가입 인증" (5pt) 확보 전략

배포 직후 카톡/디스코드로 URL 공유 → 친구 1명이 가입 + 채팅 한 줄 → 그 시점 양측 채팅 화면을 한 컷에 캡쳐. **단계 7 끝나자마자 즉시 진행.**
