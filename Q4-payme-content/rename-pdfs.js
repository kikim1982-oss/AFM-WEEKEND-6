// PDF-list 안의 파일을 {ticker}.pdf 형식으로 통일.
// 사용: node rename-pdfs.js
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'PDF-list');

const renameMap = {
  'HD현대에너지솔루션.pdf': '267260.pdf',
  '노바렉스260429.pdf': '194700.pdf',
  '메가터치260430.pdf': '317600.pdf',
  '모티브링크.pdf': '177350.pdf',
  '바이오비쥬.pdf': '396270.pdf',
  '부광약품.pdf': '003000.pdf',
  '쓰리빌리언260429.pdf': '443250.pdf',
  '원텍.pdf': '214420.pdf',
  '클래시스.pdf': '214150.pdf',
  '현대약품260429.pdf': '004310.pdf',
  'stock-analysis-000660-SK하이닉스.pdf': '000660.pdf',
  'stock-analysis-064350.pdf': '064350.pdf',
  'stock-analysis-348370.pdf': '348370.pdf',
};

let renamed = 0;
let skipped = 0;
for (const [from, to] of Object.entries(renameMap)) {
  const src = path.join(dir, from);
  const dst = path.join(dir, to);
  if (!fs.existsSync(src)) {
    console.log(`  - 누락: ${from}`);
    continue;
  }
  if (fs.existsSync(dst)) {
    // 이미 같은 ticker 이름이 있으면 덮어쓰기 (최신본 가정)
    fs.unlinkSync(dst);
  }
  fs.renameSync(src, dst);
  renamed++;
  console.log(`  ✓ ${from.padEnd(40)} → ${to}`);
}

console.log(`\n총 ${renamed}개 rename 완료.`);
console.log('\n현재 PDF-list:');
for (const f of fs.readdirSync(dir).sort()) {
  console.log(`  ${f}`);
}
