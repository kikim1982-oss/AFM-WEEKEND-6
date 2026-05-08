// schema.sql 적용 + 23개 콘텐츠 시드
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: { rejectUnauthorized: false },
});

const seeds = [
  { ticker: '267260', title: 'HD현대에너지솔루션 — 태양광 모듈 가격 반등과 마진 회복', preview: '글로벌 태양광 수요 회복 흐름 속 모듈 가격이 1분기 저점을 통과하는 모습이다. 미국 IRA 가이드라인 명확화로 북미향 출하 비중 확대가 가시화되고 있다. 자체 셀 내재화율 상승이 마진 레버리지로 작용할 가능성에 주목한다.', category: '에너지', price: 2000, published_at: '2026-04-29' },
  { ticker: '000660', title: 'SK하이닉스 — HBM 모멘텀과 2026 전망', preview: 'AI 인프라 수요 확대로 HBM3E 수주 가시성이 높아지고 있다. 1분기 출하량은 컨센서스를 상회했으며 12단 비중 확대가 ASP 상승을 견인 중이다. 2026년 HBM4 양산 진입 일정이 멀티이어 실적 모멘텀의 핵심 변수다.', category: '반도체', price: 3000, published_at: '2026-04-15' },
  { ticker: '092790', title: '넥스틸 — 에너지 강관 수주 사이클 재점검', preview: '미국 OCTG 수입 규제 환경 속 한국산 강관의 점유율이 견조하다. 셰일 리그 카운트 회복과 LNG 프로젝트 발주가 동시 진행되며 수주 가시성이 높다. 환율 우호 구간에서 마진 레버리지 효과를 기대한다.', category: '소재', price: 1000, published_at: '2026-03-22' },
  { ticker: '194700', title: '노바렉스 — 건기식 ODM 캐파 증설 효과', preview: '오송 신공장 가동률 상승이 분기를 거듭할수록 가시화되고 있다. 글로벌 고객사 신규 품목 수주가 하반기부터 매출에 반영될 전망이다. 원료 수직계열화로 원가 구조 개선이 동시에 진행 중이라는 점이 중요하다.', category: '제약', price: 1000, published_at: '2026-04-29' },
  { ticker: '047410', title: '대성미생물 — 동물의약품 수출 회복 신호', preview: '동남아 가축 사이클 회복 국면에서 백신 수출이 점진적 반등 흐름을 보이고 있다. 신제품 라인업이 의미 있는 비중으로 매출에 자리잡기 시작했다. 환율과 곡물가 안정이 마진 회복을 뒷받침할 변수다.', category: '제약', price: 500, published_at: '2026-04-10' },
  { ticker: '441460', title: '대한조선 — 중형 탱커 수주 잔고 확대', preview: '중형 탱커 시장 수급 타이트가 신조선가 상승으로 이어지고 있다. 도크 슬롯이 2027년까지 채워진 상태에서 선별 수주 전략을 유지 중이다. 환율 우호 구간에서 마진 가시성이 매우 높은 구간으로 진입하고 있다.', category: '조선', price: 2000, published_at: '2026-04-22' },
  { ticker: '388790', title: '라이콤 — 광부품 다변화와 미국 데이터센터향 매출', preview: '하이퍼스케일러향 광트랜시버 부품 수주가 확대 국면이다. 자체 패키징 라인 가동으로 외주 비중이 빠르게 축소되고 있다. 데이터센터 광인프라 사이클의 직접 수혜주로 분류한다.', category: 'IT', price: 2000, published_at: '2026-04-05' },
  { ticker: '317600', title: '메가터치 — FPCB 점유율 회복 시도', preview: '주요 고객사 신모델 FPCB 단가 협상이 마무리 국면에 진입했다. 베트남 신규 라인 가동으로 캐파 부담이 일부 해소되었다. 모듈 단위 일감 확장 여부가 중장기 멀티플 변수다.', category: 'IT', price: 500, published_at: '2026-03-30' },
  { ticker: '177350', title: '모티브링크 — 차량용 와이어링 하니스 EV 비중 확대', preview: 'EV 향 와이어링 단가가 ICE 대비 1.6~2배 높은 구조가 본격적으로 매출에 반영되고 있다. 멕시코 공장 램프업 속도가 컨센서스를 상회하는 흐름이다. 고객사 다변화가 마진 안정성을 높이는 중요한 변수다.', category: '2차전지', price: 1000, published_at: '2026-04-18' },
  { ticker: '314930', title: '바이오다인 — HPV 진단 글로벌 협업 확대', preview: '글로벌 빅파마향 HPV 진단 키트 공급 계약 갱신이 임박한 상황이다. 라이선스 수익 비중이 높아지면서 영업이익률 구조 자체가 변하고 있다. 신규 시장 진입 모멘텀이 멀티이어 성장의 핵심이다.', category: '의료기기', price: 3000, published_at: '2026-04-25' },
  { ticker: '396270', title: '바이오비쥬 — 화장품 ODM 글로벌 확장', preview: '북미 인디브랜드향 ODM 수주가 분기마다 신기록을 경신하고 있다. 자체 R&D 라인업의 비중 확대가 마진 개선의 직접 동인이다. 일본/동남아 신규 진입이 추가 모멘텀으로 작용할 전망이다.', category: '제약', price: 1000, published_at: '2026-04-12' },
  { ticker: '003000', title: '부광약품 — 파이프라인 재정비 이후 임상 가시성', preview: '지주사 재편 이후 R&D 우선순위가 명확해지면서 핵심 파이프라인 진입 일정이 앞당겨지고 있다. 기존 OTC 사업의 안정적 캐시플로가 임상 비용을 흡수하는 구조다. 라이선스 아웃 가능성이 단기 모멘텀이다.', category: '제약', price: 1000, published_at: '2026-03-15' },
  { ticker: '443250', title: '쓰리빌리언 — AI 희귀질환 진단 플랫폼 검증', preview: '국내외 대형병원 도입 사례가 누적되며 매출의 반복 가능성이 높아지고 있다. 글로벌 보험사와의 데이터 협업 논의가 진전 중인 점에 주목한다. AI 기반 검사 단가 인하 여력이 시장 확장의 핵심 변수다.', category: '의료기기', price: 3000, published_at: '2026-04-30' },
  { ticker: '339620', title: '에이치브이엠 — 특수금속 수주 잔고 사상 최고', preview: '항공·방산향 특수합금 수주 잔고가 사상 최고치를 경신했다. 미국 OEM 인증 확대로 북미 매출 비중이 빠르게 상승 중이다. 캐파 증설 일정과 가동률 곡선이 단기 실적 가시성을 결정한다.', category: '방산', price: 2000, published_at: '2026-04-08' },
  { ticker: '348370', title: '엔켐 — 전해액 글로벌 캐파 확장', preview: '미국/유럽 전해액 캐파 가동이 분기 단위로 가시화되고 있다. 셀메이커 신규 계약을 통해 매출 다변화가 진행 중이다. 원재료 수직계열화 진행이 마진 변동성 완화의 핵심 변수다.', category: '2차전지', price: 3000, published_at: '2026-04-20' },
  { ticker: '214420', title: '원텍 — 미용 의료기기 수출 확대', preview: '브라질·동남아 신규 인허가 통과로 수출 지역 다변화가 진행 중이다. 소모품(팁) 매출 비중 상승이 마진 구조 개선에 기여하고 있다. 미국 FDA 추가 적응증 승인 여부가 단기 멀티플 변수다.', category: '의료기기', price: 2000, published_at: '2026-04-02' },
  { ticker: '119610', title: '인터로조 — 컬러렌즈 글로벌 점유율 상승', preview: '일본·동남아 컬러렌즈 매출이 분기마다 신기록을 갱신하고 있다. 자체 브랜드 비중 상승이 마진 확장으로 이어지는 구조다. 신공장 가동률 곡선이 마진 추가 개선의 트리거다.', category: '의료기기', price: 1000, published_at: '2026-03-28' },
  { ticker: '389020', title: '자람테크놀로지 — 광통신 칩 점유율 확대', preview: '국내 통신사향 PON 칩 점유율이 의미 있게 상승 중이다. 일본·동남아 통신사 신규 채택이 멀티이어 성장의 동인이다. 자체 ASIC 라인업 확장이 단기 멀티플 변수다.', category: 'IT', price: 2000, published_at: '2026-04-15' },
  { ticker: '314130', title: '지놈앤컴퍼니 — 마이크로바이옴 임상 진전', preview: '글로벌 임상 단계 진입 파이프라인이 다양해지고 있다. 빅파마와의 공동 개발 계약 갱신 가능성이 단기 모멘텀이다. 라이선스 수익 인식 시점이 분기 실적 변동의 핵심 변수다.', category: '제약', price: 3000, published_at: '2026-04-25' },
  { ticker: '214150', title: '클래시스 — 슈링크 글로벌 확장 가속', preview: '미국·브라질 시장 인허가 진전으로 글로벌 매출 비중이 빠르게 상승 중이다. 소모품 매출 비중 확대가 마진 구조 자체를 개선시키고 있다. 신제품 출시 사이클이 단기 모멘텀이다.', category: '의료기기', price: 2000, published_at: '2026-04-18' },
  { ticker: '240810', title: '테크윙 — HBM 핸들러 점유율 독점 구간', preview: 'HBM 핸들러 시장에서 사실상 독점적 지위를 확보 중이다. 고객사 캐파 증설 일정에 맞춰 수주 잔고가 멀티이어로 확장된다. 신규 장비 라인업이 단기 멀티플 변수다.', category: '반도체', price: 3000, published_at: '2026-04-30' },
  { ticker: '064350', title: '현대로템 — 방산 수출 잔고 확대 + 차량 사이클', preview: '폴란드 K2 후속 계약과 중동향 추가 수출 협상이 동시 진행 중이다. 철도차량 부문 수주 잔고도 사상 최고 수준이다. 방산·철도 양 사업부의 동시 호조 구간으로 진입하고 있다.', category: '방산', price: 3000, published_at: '2026-04-12' },
  { ticker: '004310', title: '현대약품 — 신약 파이프라인 검증 단계', preview: '경구용 당뇨 신약 임상 진전이 분기마다 가시화되고 있다. OTC 캐시플로가 R&D 비용을 흡수하는 안정적 구조다. 라이선스 아웃 가능성이 단기 멀티플 변수다.', category: '제약', price: 1000, published_at: '2026-03-25' },
];

async function main() {
  const client = await pool.connect();
  try {
    console.log('▶ schema.sql 적용 중...');
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(sql);
    console.log('  ✓ 스키마 적용 완료');

    const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM contents');
    if (rows[0].n > 0) {
      console.log(`▶ contents 이미 ${rows[0].n}건 — 시드 건너뜀`);
    } else {
      console.log('▶ 23개 콘텐츠 시드 중...');
      for (const s of seeds) {
        await client.query(
          `INSERT INTO contents (ticker, title, preview, category, price, pdf_path, published_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [s.ticker, s.title, s.preview, s.category, s.price, `/pdfs/${s.ticker}.pdf`, s.published_at]
        );
      }
      console.log('  ✓ 시드 완료');
    }

    const summary = await client.query(
      `SELECT 'users' tbl, COUNT(*)::int n FROM users
       UNION ALL SELECT 'contents', COUNT(*) FROM contents
       UNION ALL SELECT 'purchases', COUNT(*) FROM purchases`
    );
    console.log('\n현재 테이블 상태:');
    for (const r of summary.rows) console.log(`  ${r.tbl.padEnd(10)} ${r.n}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('❌ 실패:', e.message);
  process.exit(1);
});
