// .env 의 값을 Vercel production 환경에 등록.
// 사용: node sync-vercel-env.js
const fs = require('fs');
const { spawnSync } = require('child_process');

const SKIP = new Set(['PORT']); // Vercel 가 자동 설정

const env = fs.readFileSync('.env', 'utf8').split(/\r?\n/);
let added = 0, failed = 0;

for (const line of env) {
  if (!line || line.trim().startsWith('#')) continue;
  const idx = line.indexOf('=');
  if (idx < 0) continue;
  const key = line.slice(0, idx).trim();
  const val = line.slice(idx + 1).trim();
  if (!key || SKIP.has(key)) continue;

  process.stdout.write(`▶ ${key.padEnd(22)} ... `);
  const r = spawnSync('vercel', ['env', 'add', key, 'production'], {
    input: val,
    encoding: 'utf8',
    shell: true,
  });
  if (r.status === 0) {
    console.log('✓');
    added++;
  } else {
    console.log('✗');
    console.log(r.stderr.split('\n').filter(Boolean).slice(-3).join('\n'));
    failed++;
  }
}

console.log(`\n완료: ${added}개 추가, ${failed}개 실패`);
process.exit(failed ? 1 : 0);
