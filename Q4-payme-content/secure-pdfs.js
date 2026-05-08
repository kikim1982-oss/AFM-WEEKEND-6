// 1) 'pdfs' 버킷을 private 로 전환
// 2) contents.pdf_path 를 객체 키만 저장하도록 정규화 (예: '267260.pdf')
// 사용: node secure-pdfs.js
require('dotenv').config();
const { Pool } = require('pg');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'pdfs';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY 가 .env 에 없습니다.');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
};

async function setBucketPrivate() {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`버킷 private 전환 실패: ${res.status} ${txt}`);
  }
  console.log(`  ✓ 버킷 '${BUCKET}' → private`);
}

async function main() {
  console.log('▶ 버킷 private 전환...');
  await setBucketPrivate();

  const pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    console.log('\n▶ pdf_path 를 객체 키로 정규화...');
    // public URL 끝의 파일명 또는 '/pdfs/...' 시드값에서 ticker 기반 키 추출
    // 안전하게: 우리 6개 ticker 에 대해서만 명시적으로 갱신
    const tickers = ['267260','194700','317600','177350','443250','004310'];
    for (const t of tickers) {
      const r = await client.query(
        'UPDATE contents SET pdf_path=$1 WHERE ticker=$2',
        [`${t}.pdf`, t]
      );
      console.log(`  ✓ ${t} → ${t}.pdf  (rows: ${r.rowCount})`);
    }

    console.log('\n현재 pdf_path 상태:');
    const { rows } = await client.query(
      `SELECT ticker, pdf_path FROM contents WHERE ticker = ANY($1) ORDER BY ticker`,
      [tickers]
    );
    for (const r of rows) console.log(`  ${r.ticker}  ${r.pdf_path}`);

    console.log('\n▶ public URL 차단 검증 (HEAD)...');
    const probe = await fetch(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/267260.pdf`, { method: 'GET' });
    console.log(`  public URL 응답: ${probe.status}  (200 이면 여전히 노출, 400/404 면 차단됨)`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('\n실패:', e.message);
  process.exit(1);
});
