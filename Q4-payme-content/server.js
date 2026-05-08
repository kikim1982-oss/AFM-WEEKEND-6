// Q4 유료콘텐츠 — Express + JWT auth + 정적 파일 서빙
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: { rejectUnauthorized: false },
});

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const PORT = Number(process.env.PORT) || 3000;

const TOSS_CLIENT_KEY = process.env.TOSS_CLIENT_KEY;
const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const PDF_BUCKET = 'pdfs';
const SIGNED_URL_TTL_SEC = 60; // 1분

if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET 환경변수가 필요합니다 (.env 확인)');
  process.exit(1);
}
if (!TOSS_CLIENT_KEY || !TOSS_SECRET_KEY) {
  console.error('❌ TOSS_CLIENT_KEY / TOSS_SECRET_KEY 환경변수가 필요합니다 (.env 확인)');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.warn('⚠️  SUPABASE_URL / SUPABASE_SERVICE_KEY 가 없습니다 — PDF signed URL 발급 불가');
}

const app = express();
app.use(cors());
app.use(express.json());

// ====================================================================
// 유효성 검사
// ====================================================================
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PW_RE = /^\d{8}$/; // 숫자 8자리

function validateCredentials(email, password) {
  if (!email || !EMAIL_RE.test(email)) return '이메일 형식이 올바르지 않습니다.';
  if (!password || !PW_RE.test(password)) return '비밀번호는 숫자 8자리여야 합니다.';
  return null;
}

// ====================================================================
// JWT 미들웨어
// ====================================================================
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: '로그인이 필요합니다.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
}

// 인증이 있으면 req.user 세팅, 없으면 그냥 통과
function authOptional(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch (e) { /* ignore */ }
  }
  next();
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// ====================================================================
// Auth API
// ====================================================================

// 회원가입
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body || {};
  const err = validateCredentials(email, password);
  if (err) return res.status(400).json({ error: err });

  try {
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rowCount > 0) return res.status(409).json({ error: '이미 등록된 이메일입니다.' });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email, hash]
    );
    const user = rows[0];
    const token = signToken(user);
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (e) {
    console.error('register error:', e);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 로그인
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const err = validateCredentials(email, password);
  if (err) return res.status(400).json({ error: err });

  try {
    const { rows } = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email]
    );
    if (rows.length === 0) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });

    const token = signToken(user);
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (e) {
    console.error('login error:', e);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 현재 사용자 (JWT 확인용)
app.get('/api/auth/me', authRequired, async (req, res) => {
  res.json({ user: { id: req.user.sub, email: req.user.email } });
});

// ====================================================================
// 콘텐츠 / 구매
// ====================================================================

// 클라이언트가 사용할 공개 설정 (TossPayments 클라이언트키 등)
app.get('/api/config', (_req, res) => {
  res.json({ tossClientKey: TOSS_CLIENT_KEY });
});

// PDF 가 정상 매핑된 콘텐츠만 노출 (pdf_path = '{ticker}.pdf' 형식)
app.get('/api/contents', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, ticker, title, preview, category, price, published_at
       FROM contents
       WHERE pdf_path ~ '^[0-9]{6}\\.pdf$'
       ORDER BY published_at DESC NULLS LAST, id DESC`
    );
    res.json({ contents: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 단일 콘텐츠 + (인증 시) 해당 사용자의 구매 여부
app.get('/api/contents/:id', authOptional, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: '잘못된 콘텐츠 ID 입니다.' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, ticker, title, preview, category, price, pdf_path, published_at
       FROM contents WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다.' });

    let isPurchased = false;
    if (req.user && req.user.sub) {
      const r = await pool.query(
        `SELECT 1 FROM purchases WHERE user_id = $1 AND content_id = $2 AND status = 'PAID' LIMIT 1`,
        [req.user.sub, id]
      );
      isPurchased = r.rowCount > 0;
    }
    res.json({ content: rows[0], isPurchased });
  } catch (e) {
    console.error('GET /api/contents/:id error:', e);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 구매한 사용자에게만 단기 signed URL 발급 (Supabase Storage)
app.get('/api/contents/:id/pdf-url', authRequired, async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(503).json({ error: 'PDF 서비스가 구성되지 않았습니다.' });
  }
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: '잘못된 콘텐츠 ID 입니다.' });
  }
  try {
    const cRes = await pool.query(
      'SELECT id, pdf_path FROM contents WHERE id = $1',
      [id]
    );
    if (cRes.rowCount === 0) return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다.' });
    const objectKey = cRes.rows[0].pdf_path;
    if (!objectKey) return res.status(404).json({ error: '해당 콘텐츠에 PDF가 없습니다.' });

    const pRes = await pool.query(
      `SELECT 1 FROM purchases WHERE user_id = $1 AND content_id = $2 AND status = 'PAID' LIMIT 1`,
      [req.user.sub, id]
    );
    if (pRes.rowCount === 0) {
      return res.status(403).json({ error: '구매하지 않은 콘텐츠입니다.' });
    }

    const signRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/${PDF_BUCKET}/${encodeURIComponent(objectKey)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          apikey: SUPABASE_SERVICE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SEC }),
      }
    );
    if (!signRes.ok) {
      const txt = await signRes.text();
      console.error('signed URL 발급 실패:', signRes.status, txt);
      return res.status(502).json({ error: 'PDF 발급에 실패했습니다.' });
    }
    const data = await signRes.json();
    // Supabase 응답: { signedURL: "/object/sign/..." } — full URL 로 가공
    const fullUrl = `${SUPABASE_URL}/storage/v1${data.signedURL}`;
    res.json({ url: fullUrl, expiresIn: SIGNED_URL_TTL_SEC });
  } catch (e) {
    console.error('GET /api/contents/:id/pdf-url error:', e);
    res.status(500).json({ error: '서버 오류' });
  }
});

app.get('/api/purchases', authRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.content_id, p.amount, p.paid_at, p.order_id, c.title, c.ticker, c.category
       FROM purchases p JOIN contents c ON c.id = p.content_id
       WHERE p.user_id = $1 AND p.status = 'PAID' ORDER BY p.paid_at DESC`,
      [req.user.sub]
    );
    res.json({ purchases: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ====================================================================
// 결제 (TossPayments)
// ====================================================================

// 메모리 기반 pending order 저장소 (5분 TTL).
// 운영 환경에서는 Redis/DB 테이블로 대체. 단일 프로세스 데모용으로 충분.
const PENDING_TTL_MS = 5 * 60 * 1000;
const pendingOrders = new Map(); // orderId -> { userId, contentId, amount, orderName, createdAt }

function purgeExpiredPendingOrders() {
  const now = Date.now();
  for (const [orderId, o] of pendingOrders) {
    if (now - o.createdAt > PENDING_TTL_MS) pendingOrders.delete(orderId);
  }
}
setInterval(purgeExpiredPendingOrders, 60 * 1000).unref?.();

function generateOrderId() {
  // 토스 권고: 6~64자, 영문/숫자/-/_
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `ord_${ts}_${rand}`;
}

// 1) 주문 생성 — 서버에서 amount/title을 결정 (위변조 방지)
app.post('/api/orders', authRequired, async (req, res) => {
  const { contentId } = req.body || {};
  const cid = parseInt(contentId, 10);
  if (!Number.isInteger(cid) || cid <= 0) {
    return res.status(400).json({ error: '잘못된 콘텐츠 ID 입니다.' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, title, price FROM contents WHERE id = $1`,
      [cid]
    );
    if (rows.length === 0) return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다.' });
    const content = rows[0];

    // 이미 구매한 경우 차단
    const dup = await pool.query(
      `SELECT 1 FROM purchases WHERE user_id = $1 AND content_id = $2 AND status = 'PAID' LIMIT 1`,
      [req.user.sub, cid]
    );
    if (dup.rowCount > 0) {
      return res.status(409).json({ error: '이미 구매한 콘텐츠입니다.' });
    }

    const orderId = generateOrderId();
    const orderName = content.title.length > 90 ? content.title.slice(0, 90) + '…' : content.title;
    pendingOrders.set(orderId, {
      userId: req.user.sub,
      contentId: cid,
      amount: content.price,
      orderName,
      createdAt: Date.now(),
    });

    res.json({
      orderId,
      orderName,
      amount: content.price,
      // customerKey: 토스 위젯 식별자 (사용자별 고유). user.id (UUID)를 그대로 사용.
      customerKey: String(req.user.sub),
    });
  } catch (e) {
    console.error('POST /api/orders error:', e);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 2) 결제 승인 — 토스 confirm API 호출 + DB 기록 (멱등)
app.post('/api/payments/confirm', authRequired, async (req, res) => {
  const { paymentKey, orderId, amount } = req.body || {};
  if (!paymentKey || !orderId || amount === undefined || amount === null) {
    return res.status(400).json({ error: 'paymentKey, orderId, amount는 필수입니다.' });
  }
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: '잘못된 결제 금액입니다.' });
  }

  // 멱등성 처리: 이미 같은 paymentKey로 처리한 결제가 있으면 그대로 성공 반환
  try {
    const existing = await pool.query(
      `SELECT id, content_id FROM purchases WHERE payment_key = $1 LIMIT 1`,
      [paymentKey]
    );
    if (existing.rowCount > 0) {
      return res.json({
        ok: true,
        purchaseId: existing.rows[0].id,
        contentId: existing.rows[0].content_id,
        alreadyProcessed: true,
      });
    }
  } catch (e) {
    console.error('confirm idempotency check failed:', e);
    return res.status(500).json({ error: '서버 오류' });
  }

  // pending order 조회 + 위변조 검증
  const pending = pendingOrders.get(orderId);
  if (!pending) {
    return res.status(400).json({ error: '주문 정보를 찾을 수 없습니다. (만료되었거나 위조된 주문)' });
  }
  if (pending.userId !== req.user.sub) {
    return res.status(403).json({ error: '해당 주문에 대한 권한이 없습니다.' });
  }
  if (pending.amount !== numericAmount) {
    console.warn('[confirm] amount mismatch', { orderId, expected: pending.amount, got: numericAmount });
    return res.status(400).json({ error: '결제 금액이 주문 금액과 일치하지 않습니다.' });
  }

  // 토스 confirm API 호출
  let tossResult;
  try {
    const auth = Buffer.from(TOSS_SECRET_KEY + ':').toString('base64');
    const r = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount: numericAmount }),
    });
    tossResult = await r.json();
    if (!r.ok) {
      console.warn('[toss confirm failed]', tossResult);
      return res.status(400).json({
        error: tossResult.message || '결제 승인에 실패했습니다.',
        code: tossResult.code,
      });
    }
  } catch (e) {
    console.error('toss confirm fetch error:', e);
    return res.status(502).json({ error: '결제 승인 서버에 접근할 수 없습니다.' });
  }

  // DB INSERT (UNIQUE 제약 + ON CONFLICT 로 이중 결제 방지)
  try {
    const ins = await pool.query(
      `INSERT INTO purchases (user_id, content_id, amount, status, payment_key, order_id, paid_at)
       VALUES ($1, $2, $3, 'PAID', $4, $5, NOW())
       ON CONFLICT (user_id, content_id) DO UPDATE
         SET payment_key = EXCLUDED.payment_key,
             order_id    = EXCLUDED.order_id,
             amount      = EXCLUDED.amount,
             status      = 'PAID',
             paid_at     = NOW()
       RETURNING id, content_id`,
      [pending.userId, pending.contentId, pending.amount, paymentKey, orderId]
    );
    pendingOrders.delete(orderId);
    res.json({
      ok: true,
      purchaseId: ins.rows[0].id,
      contentId: ins.rows[0].content_id,
    });
  } catch (e) {
    console.error('purchases insert error:', e);
    // 토스에서는 이미 승인된 상태이므로, 운영에서는 알림/리커버리 큐에 적재해야 함
    res.status(500).json({ error: '결제는 승인되었으나 기록에 실패했습니다. 고객센터로 문의해 주세요.' });
  }
});

// ====================================================================
// 정적 파일 서빙 (index.html)
// ====================================================================
app.use(express.static(__dirname));

// 정의되지 않은 /api/* 는 명시적으로 404 (index.html 폴백 방지)
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// SPA 폴백 — /payment/success, /payment/fail 등도 모두 index.html 로 라우팅
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ====================================================================
// 시작 — 로컬 dev 에서만 listen, Vercel serverless 에선 export 만
// ====================================================================
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✓ Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
