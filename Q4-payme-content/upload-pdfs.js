// PDF-list 의 모든 {ticker}.pdf 파일을 Supabase Storage('pdfs' 버킷)에 업로드(upsert) +
// contents.pdf_path 를 객체 키로 갱신 (UPDATE WHERE ticker = X).
// 사용: node upload-pdfs.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'pdfs';
const PDF_DIR = path.join(__dirname, 'PDF-list');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY 가 .env 에 없습니다.');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
};

async function ensureBucket() {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, { headers });
  if (res.ok) {
    const info = await res.json();
    console.log(`  ✓ 버킷 '${BUCKET}' 존재 (public=${info.public})`);
    return;
  }
  const create = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
  if (!create.ok) {
    const txt = await create.text();
    throw new Error(`버킷 생성 실패: ${create.status} ${txt}`);
  }
  console.log(`  ✓ 버킷 '${BUCKET}' 생성 완료 (private)`);
}

async function uploadOne(localPath, objectKey) {
  const buf = fs.readFileSync(localPath);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectKey}`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/pdf',
      'x-upsert': 'true',
      'Cache-Control': '3600',
    },
    body: buf,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`업로드 실패 (${objectKey}): ${res.status} ${txt}`);
  }
}

async function main() {
  console.log('▶ 버킷 확인...');
  await ensureBucket();

  const files = fs.readdirSync(PDF_DIR)
    .filter(f => /^\d{6}\.pdf$/i.test(f))
    .sort();
  console.log(`\n▶ ${files.length}개 PDF 발견`);

  const pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  const matched = [];
  const unmatched = [];
  try {
    console.log('\n▶ 업로드 + DB 갱신...');
    for (const file of files) {
      const ticker = file.replace(/\.pdf$/i, '');
      const local = path.join(PDF_DIR, file);
      await uploadOne(local, file);
      const r = await client.query(
        'UPDATE contents SET pdf_path=$1 WHERE ticker=$2',
        [file, ticker]
      );
      const tag = r.rowCount > 0 ? 'DB✓' : 'DB✗ (ticker 미존재)';
      console.log(`  ${r.rowCount > 0 ? '✓' : '!'} ${file}  ${tag}`);
      (r.rowCount > 0 ? matched : unmatched).push(ticker);
    }

    console.log('\n=== 결과 ===');
    console.log(`업로드 + DB 매칭: ${matched.length}개`);
    if (unmatched.length) {
      console.log(`업로드는 됐지만 DB ticker 미존재: ${unmatched.length}개`);
      for (const t of unmatched) console.log(`  - ${t}.pdf`);
    }

    console.log('\n현재 contents.pdf_path 상태 (전체):');
    const { rows } = await client.query(
      `SELECT ticker, title, pdf_path FROM contents ORDER BY ticker`
    );
    for (const r of rows) {
      const has = r.pdf_path && /^\d{6}\.pdf$/.test(r.pdf_path) ? '✓' : '·';
      console.log(`  ${has} ${r.ticker}  ${r.title.slice(0, 26).padEnd(28)}  ${r.pdf_path || '(none)'}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('\n실패:', e.message);
  process.exit(1);
});
