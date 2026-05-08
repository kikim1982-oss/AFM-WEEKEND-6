# DEV.md - 우진산업 ERP 구매 모듈 v1 개발 가이드

> 우진산업(제지 케미컬) 회계 담당자 정년 D-2년을 향한 ERP 구축의 첫 모듈 — 원재료 매입(국내+해외) 디지털화 및 대표 가시성 확보.
> Architecture: **Option 2 — Supabase JS** (무료 플랜 시작 + 추후 개인서버 연결 가능성 고려한 포터빌리티 설계)
> 작성일: 2026-05-08
> 기반: `MISSION.md`, `consulting-log.md` (Round 1~6)

---

## Requirements

MISSION.md에서 추출한 v1 필수 요구사항 체크리스트.

### 핵심 기능
- [ ] 매입 내역 입력 — **국내 양식** (거래처, 품목, 수량, 단가 KRW, 일자, 결제조건, 세금계산서 번호, 부가세 분리)
- [ ] 매입 내역 입력 — **해외 양식** (거래처 해외, 품목, 수량, 단가 외화, 통화, 환율, 환율 적용 시점, Commercial Invoice 번호, B/L, 관세·통관비용, 결제조건 T/T·L/C 등)
- [ ] **권한 관리 (2단계)** — 입력자 / 관리자(대표). 대표가 직원에게 권한 부여·회수.
- [ ] **데이터 조회 / 리스트 뷰** — 거래처별·품목별·일자별·통화별 필터·정렬, KRW 환산 합계.
- [ ] **대표용 분석 / 보고 화면** — 1주일 매입 내역 한 화면, 거래처별·품목별 합계, 월별 추세.
- [ ] **Audit log** — 누가 언제 무엇을 입력/수정/삭제했는지 자동 기록.

### 성공 기준 (Measurable)
- [ ] 국내 매입 1건 입력 90초 이내
- [ ] 해외 매입 1건 입력 3분 이내
- [ ] 1주일 매입 내역을 대표가 한 화면에서 거래처/품목/통화별 합계로 확인
- [ ] 직원 1명이 30분 교육 후 보고 없이 입력 가능
- [ ] 매입 데이터 디지털 보유율 100% (정년 D-day까지)

---

## Non-goals

v1에서 **명시적으로 하지 않을 것**. (MISSION.md §2.2)

| 카테고리 | 제외 항목 | 이유 |
|---|---|---|
| 모듈 | 매출 전표 | v1.5~v2 |
| 매입 | 부자재 / 소모품 | 원재료만 |
| 회계 연동 | 세금계산서 자동 발행 / 국세청 연동 | 외부 연동 복잡도 |
| 워크플로우 | 전자결재 / 승인 흐름 | 1인 빌더 부담 |
| 채널 | 모바일 앱 | PC 웹만 |
| 채널 | 거래처 포털 | 외부 노출 보안 |
| 데이터 | 실시간 재고 추적 | v3 |
| 권한 | 세분화 RBAC | v1은 2단계만 |
| 통화 | 다중 통화 환산 자동화 | 수동 환율 입력 |
| 통관 | 수입신고필증 OCR | v1.5+ |
| 알림 | 결제 일정 알림 | v1.5+ |
| 인프라 | Supabase Realtime / Edge Functions 적극 활용 | **포터빌리티(개인서버 이전 가능성) 위해 자제** |

---

## Style

UI/UX 가이드 — **빠른 입력 우선**.

- **입력 우선 화면**: 매입 입력 폼은 메인 화면. 화면 진입 후 3초 이내 입력 시작 가능.
- **키보드 친화**: Tab 키로 모든 필드 이동, Enter로 저장. 마우스 의존 최소화.
- **국내 / 해외 폼 분기**: 진입 시 한 번만 선택. 폼 안에서 토글 X (필드가 너무 다름).
- **자동완성**: 거래처명·품목명은 마스터 기반 자동완성 (마스터 도입 시).
- **에러는 인라인**: 모달 X. 필드 옆에 빨간 텍스트.
- **저장 후 즉시 다음 건 입력 가능**: "저장" → 폼 비우고 커서가 첫 필드로 복귀.
- **대표용 화면은 분리**: 입력자는 입력 화면만, 대표는 분석/리스트 화면 우선 노출.
- **색상 톤**: 단색 위주. 화려한 색 금지 — 회계 데이터는 차분해야 신뢰감.
- **숫자 포맷**: 천단위 콤마, 통화 기호 명시. KRW 환산값은 항상 동시 표시.

---

## Key Concepts

프로젝트 핵심 용어 정의. 신규 합류자가 30분 안에 따라잡을 수 있도록.

| 용어 | 설명 |
|---|---|
| **국내 매입** | 통화 KRW 고정, 세금계산서 1장, 부가세 10% 분리, 결제조건 현금/어음/계좌이체/외상. 리드타임 일 단위. |
| **해외 매입** | 통화 USD/EUR/CNY/JPY 등, 환율 필수, Commercial Invoice + Packing List + B/L, 관세·통관 부가세·운송비 별도, 결제조건 T/T·L/C·D/A·D/P. 리드타임 주~월 단위. |
| **환율 적용 시점** | 계약일 / 선적일 / 결제일 / 입고일 중 어느 시점 환율로 KRW 환산할지. **v1 Open Question** — 일단 사용자가 환율을 직접 입력하고 적용 시점을 메타로 기록. |
| **KRW 환산** | 해외 매입의 외화 금액 × 환율 = KRW. 분석 화면에서 통화 횡단 합계를 위해 필수. DB 컬럼 또는 View로 계산해 클라이언트 의존 최소화. |
| **권한 모델 (2단계)** | `input` (입력자: 본인 입력 건만 조회/수정) / `admin` (대표: 전체 조회·분석·권한 부여·audit log). RLS로 강제. |
| **RLS (Row Level Security)** | Supabase Postgres의 행 단위 접근 제어. 클라이언트가 어떤 쿼리를 보내든 DB 차원에서 권한 검증. v1 보안의 핵심. |
| **Audit log** | `purchase` 테이블에 INSERT/UPDATE/DELETE가 일어날 때마다 Postgres 트리거가 `audit_log` 테이블에 자동 기록 (사용자, 시각, 이전값, 새값). |
| **거래처 마스터 / 품목 마스터** | 거래처와 품목의 정규화된 참조 테이블. v1에 포함할지 Open Question — 일단 마스터로 시작, 마이그레이션 부담 시 자유 입력 fallback. |
| **포터빌리티 의식 설계** | Supabase 종속을 최소화. 비즈니스 로직을 DB 함수/View에 두고, Supabase 전용 API(Realtime, Edge Functions, Storage 직접 호출)는 v1에서 자제. 환경변수로 endpoint 추상화. |

---

## Open Questions

v1 진행 중 결정해야 할 사항. 모르는 채로 시작해도 됨 — Phase 2~3에서 자연스럽게 답이 나옴.

1. **환율 적용 시점 정책** — 계약일 / 선적일 / 결제일 / 입고일 중 어느 시점? v1은 사용자 직접 입력 + 메타 기록. v2에서 자동화 정책 결정.
2. **거래처 마스터를 v1에 넣을지** — 마이그레이션 부담 vs 데이터 품질. Phase 2에서 결정.
3. **품목 코드 체계** — 회사 내부 기존 코드 존재 여부 확인 필요. 없으면 신규 체계 제안.
4. **입력 단위** — 전표 / 발주 / 품목 / 입고 중 1건 단위. Round 4 Q8 미해결. 회계 담당자의 현재 엑셀 단위가 정답일 가능성.
5. **현재 매입 업무 실제 흐름** — Round 5 Q11 미답변. Phase 1 프로토타입 만들면서 1~2일 인터뷰 필요.
6. **관세·통관비용 처리** — 별도 라인 vs 매입가 합산. v1은 별도 라인 + 합산 View 둘 다.
7. **첨부 파일 처리** — 세금계산서·Commercial Invoice·B/L 스캔본 보관 여부. 보관 시 Supabase Storage vs 추후 개인서버. v1은 일단 보류.
8. **"개인서버 연결"의 정확한 범위** — 사용자의 명시적 답변: *"Supabase를 무료 사용하고 개인서버를 가져다 붙일게."* 다음 시나리오 중 어느 것인지 v1 안정화 후 결정:
   - (a) 사내 서버에 일부 기능(파일 저장, 사내망 전용 API, 보조 처리) 분리
   - (b) Supabase self-hosted로 전체 마이그레이션
   - (c) Supabase는 인증·DB만 유지하고 분석/리포트 워크로드만 사내 서버로
   → **v1 설계 원칙**: 어느 시나리오든 가능하도록 비즈니스 로직을 DB 함수/View에 두고, 클라이언트는 endpoint를 환경변수로 받게 한다.

---

## 선택된 개발 구조

### Option 2: Supabase JS + 추후 개인서버 연결 가능성

**구성**
- **Auth**: Supabase Auth (email/password). OAuth는 v1에서 미사용 (사내 직원만).
- **Database**: Supabase PostgreSQL + RLS. 거래처/품목/매입/audit_log 테이블.
- **Frontend**: 정적 HTML/JS + Supabase JS 클라이언트. 별도 빌드 도구 없이 시작 (필요 시 Vite 도입).
- **Hosting**: Vercel 또는 Netlify 무료 플랜 (정적 파일).
- **Storage (미사용 권장)**: Supabase Storage는 v1 보류. 첨부파일은 Open Question로 남김.

**왜 이 구조인가**
- 인증 + DB + RLS가 즉시 사용 가능 → 1인 빌더가 백엔드 코드 작성 시간 최소화.
- RLS로 보안 자동화 → Multi-user 권한 관리(MISSION.md의 v1 진입 항목)를 코드 거의 없이 구현.
- 무료 플랜 한도(500MB DB, 50K MAU)로 우진산업 50명 규모 충분.
- 자동 백업 7일 — v1 검증 단계에 적합.

**왜 포터빌리티 의식 설계인가**
사용자가 "Supabase 무료 사용 + 개인서버 가져다 붙일게"라고 명시. 이는 Supabase 영구 종속을 원치 않는다는 신호. 따라서:

- **비즈니스 로직은 DB(Postgres 함수/뷰/트리거)에 둔다** — 어떤 백엔드든 호출 가능. 클라이언트 비즈니스 로직 최소화.
- **Supabase 전용 API는 자제** — Realtime, Edge Functions, Storage 직접 호출은 v1에서 사용 안 함. 표준 Postgres 기능과 PostgREST 호환 쿼리만.
- **환경변수로 endpoint 추상화** — `SUPABASE_URL`을 직접 박지 않고 `API_BASE_URL`로 래핑. 추후 self-hosted Supabase 또는 PostgREST 직접 운영 시 URL만 교체.
- **인증 토큰 추상화** — `supabase.auth` 호출을 `lib/auth.js`로 한 번 감싼다. 추후 다른 인증 백엔드로 교체 가능.

**Supabase 무료 플랜 적합성 (v1 한정)**
- DB 500MB: 매입 건수 연 수천 건 + 첨부 파일 미보관 → 충분.
- Auth 50K MAU: 우진산업 직원 약 50명 → 충분.
- 7일 자동 백업: v1 프로토타입 단계 적합. 운영 단계 진입 시 유료 또는 자체 백업 정책 추가 검토.
- 프로젝트 일시 정지 (1주 미사용 시): 매일 입력하는 ERP 특성상 자동 회피.

---

## 개발 환경 / 도구

- **언어**: HTML/CSS/JavaScript (Vanilla). 프레임워크 없이 시작. 화면이 늘어나면 Phase 4에서 경량 라우터 도입 검토.
- **DB 클라이언트**: `@supabase/supabase-js` v2.
- **빌드**: 없음 (정적 파일). 환경변수 주입은 빌드 시점에 `process.env` 치환 또는 런타임 fetch.
- **패키지 매니저**: npm.
- **버전 관리**: Git. v1은 단일 브랜치 (main)로 충분.
- **에디터**: VSCode 권장.
- **로컬 서버**: `npx serve` 또는 `python -m http.server`. Supabase는 클라우드 직접 연결.

---

## 프로젝트 구조

```
My-personal-project-ERP/
├── index.html                 # 진입 화면 (로그인)
├── pages/
│   ├── login.html             # 로그인 / 비밀번호 변경
│   ├── purchase-domestic.html # 국내 매입 입력
│   ├── purchase-foreign.html  # 해외 매입 입력
│   ├── list.html              # 매입 리스트 / 필터
│   ├── analysis.html          # 대표용 분석 화면
│   └── admin.html             # 권한 관리 (관리자 전용)
├── lib/
│   ├── supabase-client.js     # Supabase 클라이언트 초기화 (env 추상화)
│   ├── auth.js                # 인증 래퍼 (포터빌리티)
│   ├── api.js                 # 매입/거래처/품목 CRUD (PostgREST 표준)
│   ├── format.js              # 통화/날짜/숫자 포맷
│   └── rates.js               # 환율 적용 로직 (사용자 직접 입력 + 메타 기록)
├── styles/
│   └── main.css               # 단순 단색 톤
├── db/
│   ├── schema.sql             # 테이블 정의 (거래처, 품목, 매입, audit_log, 권한)
│   ├── rls.sql                # Row Level Security 정책
│   ├── triggers.sql           # audit_log 자동 기록 트리거
│   └── views.sql              # KRW 환산 View, 분석용 집계 View
├── prototype-v1.html          # Phase 1 프로토타입 (Phase 2에서 index.html로 통합 후 삭제)
├── package.json
├── .env.example               # 환경변수 템플릿 (커밋)
├── .env                       # 실제 키 (gitignore)
├── .gitignore
└── README.md                  # 빌드/배포 빠른 시작
```

> **포터빌리티 의식**: 비즈니스 로직(KRW 환산, 권한 체크, audit log)은 모두 `db/` 안의 SQL에 둔다. 클라이언트 `lib/api.js`는 표준 PostgREST 쿼리만 던진다. Supabase 영구 종속 없음.

---

## TODO List

Vibe Coding Optimized phases. 각 Phase 끝에 📌 체크포인트와 git commit 규칙.

### Phase 1: 디자인 & 프로토타이핑

서버 코드 일절 없음. `prototype-v1.html` 단일 파일을 브라우저에서 직접 열어 확인.

- [ ] 🟢 `prototype-v1.html` 생성 — 단일 HTML 파일, CSS/JS inline
- [ ] 🟢 로그인 화면 목업 (이메일/비밀번호 입력 + 로그인 버튼) — 더미 데이터로 통과 처리
- [ ] 🟢 국내 매입 입력 폼 목업 (거래처, 품목, 수량, 단가 KRW, 일자, 결제조건, 세금계산서 번호, 부가세) — 저장 시 alert
- [ ] 🟢 해외 매입 입력 폼 목업 (거래처, 품목, 수량, 단가 외화, 통화 select, 환율, 환율 적용 시점, Commercial Invoice, B/L, 관세, 통관비용, 결제조건 T/T·L/C) — 저장 시 alert
- [ ] 🟢 매입 리스트 화면 목업 — 더미 10건 표시, 필터/정렬 UI만
- [ ] 🟢 대표용 분석 화면 목업 — 1주일 매입 합계, 거래처별/품목별/통화별 더미 차트(텍스트 합계로도 OK)
- [ ] 🟢 화면 간 단순 네비게이션 (location.hash 또는 단일 페이지 내 토글)
- [ ] 📌 git commit: `feat(prototype): v1 화면 목업 5종`
- 📌 **Phase 1 체크포인트**: 브라우저에서 `prototype-v1.html`을 더블클릭하면 모든 화면이 보이고 네비게이션이 동작. 사용자(대표 + 1~2명 직원)에게 보여주고 피드백 수집.

---

### Phase 2: 기본 기능 (쉬운 것부터)

프로젝트 초기화 → 실제 Supabase 연결 → 기본 CRUD.

- [ ] 🟢 `npm init -y` 및 `npm i @supabase/supabase-js` 설치
- [ ] 🟢 `.gitignore`, `.env.example`, `package.json` scripts 정리
- [ ] 🟢 Supabase 프로젝트 생성 (supabase.com 무료 플랜) — URL/anon key 확보
- [ ] 🟢 `prototype-v1.html` → `index.html` + `pages/` 분할 (실제 라우팅으로 전환)
- [ ] 🟢 `lib/supabase-client.js` — env 추상화 + 클라이언트 인스턴스. **`API_BASE_URL` 환경변수로 래핑**(포터빌리티)
- [ ] 🟢 `lib/auth.js` — 로그인/로그아웃 래퍼. Supabase 호출은 이 파일에서만
- [ ] 🟢 Supabase Auth 설정 — email/password 활성화, 회원가입 비활성화 (관리자가 직접 발급)
- [ ] 🟡 `db/schema.sql` 작성 — 테이블: `vendors`, `items`, `purchase`, `users_role`, `audit_log`. **국내/해외는 한 테이블 + `kind` 컬럼 + 해외 전용 컬럼 nullable** (공통 트랜잭션 모델 위에 차이만 분리, MISSION.md §6 권장)
- [ ] 🟡 Supabase Studio에서 schema.sql 실행
- [ ] 🟡 거래처 마스터 / 품목 마스터 — 시드 데이터 5~10건 (실제 우진산업 데이터 일부)
- [ ] 🟡 국내 매입 입력 폼 → Supabase insert 연결 (입력 후 토스트 + 폼 리셋)
- [ ] 🟡 해외 매입 입력 폼 → Supabase insert 연결 (환율은 사용자 직접 입력)
- [ ] 🟡 매입 리스트 조회 — Supabase select + 클라이언트 필터/정렬
- [ ] 📌 git commit: `feat(crud): 매입 입력/조회 Supabase 연결 + 스키마 v1`
- 📌 **Phase 2 체크포인트**: 브라우저에서 로그인 → 국내 매입 1건 입력 → 리스트에서 확인 → 해외 매입 1건 입력 → 리스트에서 확인. **이 시점에 권한 체크는 없음** (Phase 2.5에서 추가).

---

### Phase 2.5: 플랫폼 연결 검증 (Supabase RLS + 권한)

**Supabase 종속 부분이 가장 큰 곳이므로 Phase 3 전에 검증.** RLS가 무너지면 보안이 무너진다.

- [ ] 🟡 `db/rls.sql` 작성 — 정책:
  - `purchase` 테이블: SELECT는 본인 입력 건 OR `admin` role / INSERT는 인증된 사용자 / UPDATE·DELETE는 본인 입력 건 + 24시간 이내 OR `admin`
  - `vendors`, `items`: SELECT는 모두 인증 / 수정은 `admin`
  - `users_role`: SELECT/UPDATE 모두 `admin`만
  - `audit_log`: SELECT는 `admin`만, INSERT는 트리거에서만
- [ ] 🟡 RLS 정책 활성화 (Supabase Studio → 각 테이블 RLS Enable)
- [ ] 🟡 실제 직원 테스트 계정 2개 발급 (입력자 1명, 관리자 1명)
- [ ] 🟡 입력자 계정으로 로그인 → 본인 입력 건만 보이는지 확인
- [ ] 🟡 입력자 계정으로 다른 사람 건 update 시도 → 거부되는지 확인
- [ ] 🟡 관리자 계정으로 로그인 → 전체 보이는지 확인
- [ ] 🔴 RLS 우회 시도 — 클라이언트에서 직접 SQL 조작, JWT 변조 등으로 본인 권한 외 데이터 접근 시도. 모두 차단되어야 함
- [ ] 📌 git commit: `feat(rls): Phase 2.5 RLS 정책 + 권한 검증 통과`
- 📌 **Phase 2.5 체크포인트**: 입력자/관리자 두 계정으로 실제 로그인 후 권한 분리가 DB 수준에서 강제됨을 확인. RLS 우회 시도 모두 실패. 이 시점부터는 클라이언트 코드의 권한 체크는 보조용.

---

### Phase 3: 핵심 & 어려운 기능 (불확실한 것부터)

- [ ] 🔴 **환율 적용 정책 + KRW 환산** — 가장 불확실. v1은 입력자가 환율 직접 입력 + 환율 적용 시점(계약일/선적일/결제일/입고일) 메타로 기록. KRW 환산값은 `purchase_with_krw` View에서 계산. ⚠️ 우회 방안: 자동 환율 API(한국수출입은행)는 v2로 미룸. v1은 입력자가 거래처에서 받은 환율을 그대로 입력.
- [ ] 🔴 **해외 매입 전용 필드 검증** — B/L 번호, Commercial Invoice 번호, 통관비용, T/T·L/C 결제조건. 실제 우진산업 해외 매입 1건을 가져와 모델에 다 들어가는지 검증. ⚠️ 들어가지 않으면 스키마 수정 필요. 우회 방안: `extras` JSONB 컬럼 두고 임시 수용 후 v1.5에서 정규화.
- [ ] 🔴 **Audit log 트리거** — `db/triggers.sql`. INSERT/UPDATE/DELETE 시 `audit_log` 테이블에 자동 기록 (user_id, table, action, old_row, new_row, timestamp). RLS와 충돌 없는지 검증. ⚠️ 우회 방안: 트리거 대신 클라이언트에서 audit log를 별도 insert (보안 약함, 최후의 수단).
- [ ] 🟡 **대표용 집계 화면** — `db/views.sql`에 월별/거래처별/통화별 매입 합계 View. analysis.html에서 View 그대로 select. 차트는 단순 막대 (Chart.js CDN 또는 텍스트 표).
- [ ] 🟡 **권한 관리 화면** (admin.html) — 대표가 직원 이메일 입력 → 계정 발급 + role 부여(input/admin). Supabase Auth Admin API 또는 Supabase Studio 수동 발급 + role만 화면에서 토글.
- [ ] 🟡 **거래처/품목 마스터 관리 화면** — admin 전용. CRUD UI.
- [ ] 🟡 **본인 입력 건 수정/삭제 UI** — 24시간 이내만 (RLS와 일치).
- [ ] 📌 git commit: `feat(core): 환율·해외매입·audit·집계·권한관리`
- 📌 **Phase 3 체크포인트**: 우진산업 실제 매입 데이터 10건(국내 5 + 해외 5)을 입력 → 대표 화면에서 1주일 합계 확인 → audit_log에 모든 동작이 기록됨을 확인. 성공 기준 90초/3분 측정.

---

### Phase 4: 마무리 & 배포

- [ ] 🟡 UI 폴리싱 — 인라인 에러 메시지, 로딩 상태, 빈 상태(empty state)
- [ ] 🟡 입력 검증 — 음수 금액 차단, 미래 날짜 경고, 필수 필드 표시
- [ ] 🟡 키보드 친화 검증 — Tab 순서, Enter 저장, 단축키
- [ ] 🟡 반응형 (PC만, 1280~1920px) — 모바일 대응 X (anti-scope)
- [ ] 🟡 정적 호스팅 배포 — Vercel 또는 Netlify 무료. 환경변수 주입.
- [ ] 🟡 사내 직원 계정 발급 (입력자 2~3명, 관리자 1명) + 30분 사용법 매뉴얼 (1페이지)
- [ ] 🟡 사용 시작 후 1주 모니터링 — 입력 시간 측정, 오류 로그 수집
- [ ] 📌 **개인서버 연결 검토 시점** — v1 안정화 후 Open Question #8을 다시 논의. 사용자가 어떤 시나리오 (a/b/c)를 원하는지 결정.
- [ ] 📌 git commit: `release(v1): 매입 모듈 v1 배포`
- 📌 **Phase 4 체크포인트**: 사내 직원이 보고 없이 30분 교육 후 실제 매입 입력 가능. 대표가 한 화면에서 1주일 매입 내역 확인. **"엑셀 안 봐도 되네"** 의 순간 도달 = v1 성공.

---

## 외부 설정 필요 항목

### 필수 (Must Have)

| 항목 | 설명 | 획득 방법 |
|---|---|---|
| `SUPABASE_URL` | Supabase 프로젝트 URL | 1) supabase.com 가입(무료) → 2) New Project → 3) 프로젝트명 `woojin-erp-v1` → 4) Region: Northeast Asia (Seoul) → 5) DB password 강력하게 (저장 필수) → 6) Project Settings → API → `Project URL` 복사 |
| `SUPABASE_ANON_KEY` | 클라이언트용 anon public key | Supabase Dashboard → Project Settings → API → `anon public` 키 복사. **클라이언트에 노출 OK** (RLS가 보안) |
| `SUPABASE_SERVICE_ROLE_KEY` | 관리자용 서버 키 (Auth 사용자 발급 시) | 같은 페이지의 `service_role` 키. **절대 클라이언트에 노출 금지**. 사용자 발급 스크립트에서만 로컬 사용 |
| 이메일 발송 | 로그인/비밀번호 재설정 메일 | Supabase 기본 발송 도메인 사용 (월 30건 무료, v1 충분). 한도 초과 시 SMTP 연동 (Resend/SendGrid) |
| 정적 호스팅 계정 | Vercel 또는 Netlify | vercel.com 또는 netlify.com 가입(무료) → GitHub 연동 → 본 레포 import → 환경변수 등록(`SUPABASE_URL`, `SUPABASE_ANON_KEY`만) |
| Git 저장소 | 코드 버전 관리 | GitHub Private 레포 생성 |

### 선택 (Nice to Have, v1.5 이후)

| 항목 | 설명 | 획득 방법 |
|---|---|---|
| 환율 API | 한국수출입은행 무료 API | koreaexim.go.kr 인증키 신청. 영업일 11시 이후 고시환율. **v2 자동화용** |
| 회사 도메인 | erp.woojin.co.kr 등 사내 ERP 도메인 | 회사 도메인 DNS에 Vercel/Netlify CNAME 추가 |
| SMTP | 자체 메일 서버 또는 Resend/SendGrid | resend.com 가입(무료 100건/일) → API 키 → Supabase Auth → SMTP 설정에 입력 |
| 개인서버 SSH 정보 | 추후 일부 기능 분리 또는 self-hosted 시 | 사내 서버 IP, SSH key. **v1 안정화 후 Open Question #8 답에 따라 결정** |
| Supabase 유료 플랜 | 무료 플랜 한도 초과 시 ($25/월~) | Supabase Dashboard → Billing |
| 첨부 파일 저장소 | 세금계산서/B/L 스캔본 | Supabase Storage (무료 1GB) 또는 사내 NAS (Open Question #7) |

### `.env.example` 템플릿

```env
# Supabase (무료 플랜)
API_BASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
# 서버 작업 전용 (절대 클라이언트 빌드에 포함 금지)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# 추후 개인서버 연결 시 API_BASE_URL만 교체하면 됨 (포터빌리티 설계)
# API_BASE_URL=https://erp-api.woojin.internal
```

---

## 시작하기

처음부터 따라할 수 있는 빠른 시작.

```bash
# 1) 디렉토리 준비
cd C:\Users\kikim\Downloads\AFM-WEEKEND-6\My-personal-project-ERP

# 2) Git 초기화
git init
git add MISSION.md consulting-log.md DEV.md
git commit -m "docs: MISSION + consulting log + DEV.md (Supabase JS)"

# 3) npm 초기화 + Supabase 클라이언트
npm init -y
npm i @supabase/supabase-js

# 4) Supabase 프로젝트 생성
#    → supabase.com 가입 → New Project → woojin-erp-v1
#    → Region: Northeast Asia (Seoul)
#    → Project Settings → API에서 URL과 anon key 확보

# 5) 환경변수 설정
copy NUL .env.example
# .env.example 내용은 위 "외부 설정 필요 항목" 참고
copy .env.example .env
# .env에 실제 값 입력 (gitignore 처리 확인)

# 6) Phase 1 시작 — 프로토타입
#    → prototype-v1.html 생성
#    → 더미 데이터로 5종 화면 (로그인, 국내 매입, 해외 매입, 리스트, 분석)
#    → 브라우저에서 더블클릭으로 확인

# 7) 로컬 서버 (Phase 2 진입 후)
npx serve .
# 또는
python -m http.server 8000
```

### `package.json` 권장 scripts

```json
{
  "scripts": {
    "dev": "npx serve .",
    "db:schema": "echo Apply db/schema.sql in Supabase Studio SQL Editor",
    "db:rls": "echo Apply db/rls.sql in Supabase Studio SQL Editor",
    "db:triggers": "echo Apply db/triggers.sql in Supabase Studio SQL Editor"
  }
}
```

### 첫 주 작업 흐름 (참고)

1. **Day 1**: 본 DEV.md 정독 + Supabase 프로젝트 생성 + 무료 플랜 한도 확인.
2. **Day 2~3**: Phase 1 — `prototype-v1.html` 5종 화면. 우진산업 직원 1~2명에게 보여주고 피드백.
3. **Day 4~7**: Open Question #5 (현재 매입 업무 흐름) 인터뷰 1~2건. 현재 회계 담당자에게 엑셀 시트 단위(Q8) 확인.
4. **Day 8~**: Phase 2 진입.

---

> **이 문서는 살아있는 가이드이며 v1 진행 중 결정되는 사항(환율 정책, 입력 단위, 거래처 마스터 마이그레이션 범위, 개인서버 연결 범위 등)으로 갱신됨.**
