// Q5 carrot-repl — Express + JWT auth + 정적 파일 서빙
// 단계 2: cm_users 기반 회원가입/로그인/me. 이후 단계에서 listings/messages 추가.
require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
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
const PORT = Number(process.env.PORT) || 3001;

const IMAGEKIT_PUBLIC_KEY  = process.env.IMAGEKIT_PUBLIC_KEY;
const IMAGEKIT_PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY;
const IMAGEKIT_URL_ENDPOINT = process.env.IMAGEKIT_URL_ENDPOINT;

const TOSS_CLIENT_KEY = process.env.TOSS_CLIENT_KEY;
const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY;

if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET 환경변수가 필요합니다 (.env 확인)');
  process.exit(1);
}
if (!IMAGEKIT_PRIVATE_KEY) {
  console.warn('⚠️  IMAGEKIT_PRIVATE_KEY 가 없습니다 — /api/imagekit-auth 가 500을 반환합니다.');
}
if (!TOSS_CLIENT_KEY || !TOSS_SECRET_KEY) {
  console.warn('⚠️  TOSS_CLIENT_KEY / TOSS_SECRET_KEY 가 없습니다 — 결제 API 가 500을 반환합니다.');
}

const app = express();
app.use(cors());
app.use(express.json());

// ====================================================================
// 유효성 검사
// ====================================================================
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PW_RE = /^\d{8}$/; // 숫자 8자리
const NEIGHBORHOODS = ['망원동', '연남동']; // 프로토타입: 2개 고정
const CATEGORIES = ['도자기', '생활용품', '전자기기', '의류', '기타'];
const STATUSES = ['ON_SALE', 'RESERVED', 'SOLD'];

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

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    nickname: row.nickname,
    neighborhood: row.neighborhood,
  };
}

// ====================================================================
// Auth API
// ====================================================================

// 회원가입
app.post('/api/auth/register', async (req, res) => {
  const { email, password, nickname, neighborhood } = req.body || {};
  const credErr = validateCredentials(email, password);
  if (credErr) return res.status(400).json({ error: credErr });
  if (!nickname || typeof nickname !== 'string' || nickname.trim().length < 2 || nickname.trim().length > 20) {
    return res.status(400).json({ error: '닉네임은 2~20자여야 합니다.' });
  }
  if (!NEIGHBORHOODS.includes(neighborhood)) {
    return res.status(400).json({ error: `동네는 ${NEIGHBORHOODS.join(' / ')} 중 하나여야 합니다.` });
  }

  try {
    const exists = await pool.query('SELECT id FROM cm_users WHERE email = $1', [email]);
    if (exists.rowCount > 0) return res.status(409).json({ error: '이미 등록된 이메일입니다.' });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO cm_users (email, password_hash, nickname, neighborhood)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, nickname, neighborhood`,
      [email, hash, nickname.trim(), neighborhood]
    );
    const user = rows[0];
    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
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
      `SELECT id, email, password_hash, nickname, neighborhood
       FROM cm_users WHERE email = $1`,
      [email]
    );
    if (rows.length === 0) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (e) {
    console.error('login error:', e);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 현재 사용자
app.get('/api/auth/me', authRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, nickname, neighborhood FROM cm_users WHERE id = $1`,
      [req.user.sub]
    );
    if (rows.length === 0) return res.status(401).json({ error: '사용자를 찾을 수 없습니다.' });
    res.json({ user: publicUser(rows[0]) });
  } catch (e) {
    console.error('me error:', e);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ====================================================================
// ImageKit 업로드 인증 (클라이언트가 ImageKit으로 직접 업로드)
// ====================================================================
// 흐름:
//   1) 로그인한 클라이언트가 GET /api/imagekit-auth → token/expire/signature 받음
//   2) 클라이언트가 ImageKit upload API에 직접 POST → URL 받음
//   3) 받은 URL을 POST /api/listings 의 imageUrls 배열에 담아 전송
app.get('/api/imagekit-auth', authRequired, (_req, res) => {
  if (!IMAGEKIT_PRIVATE_KEY) {
    return res.status(500).json({ error: 'ImageKit private key가 설정되지 않았습니다.' });
  }
  try {
    const token = crypto.randomUUID();
    const expire = Math.floor(Date.now() / 1000) + 600; // 10분
    const signature = crypto
      .createHmac('sha1', IMAGEKIT_PRIVATE_KEY)
      .update(token + expire)
      .digest('hex');
    res.json({
      token,
      expire,
      signature,
      publicKey: IMAGEKIT_PUBLIC_KEY,
      urlEndpoint: IMAGEKIT_URL_ENDPOINT,
    });
  } catch (err) {
    console.error('imagekit-auth error:', err);
    res.status(500).json({ error: 'ImageKit 인증 파라미터 생성 실패' });
  }
});

// ====================================================================
// 상품 (cm_listings) API
// ====================================================================

function listingRow(r) {
  return {
    id: r.id,
    sellerId: r.seller_id,
    sellerNickname: r.seller_nickname || undefined,
    title: r.title,
    price: r.price,
    description: r.description,
    category: r.category,
    neighborhood: r.neighborhood,
    images: r.image_urls || [],
    status: r.status,
    createdAt: r.created_at,
  };
}

// 목록 (검색/필터/정렬)
//   q=검색어 (title|description ILIKE)
//   category=도자기|...
//   neighborhood=망원동|연남동 (없으면 전체)
//   sort=recent (기본)
app.get('/api/listings', async (req, res) => {
  const { q, category, neighborhood, sort } = req.query;
  const where = [];
  const params = [];
  if (q && typeof q === 'string' && q.trim()) {
    params.push('%' + q.trim() + '%');
    where.push(`(l.title ILIKE $${params.length} OR l.description ILIKE $${params.length})`);
  }
  if (category && CATEGORIES.includes(category)) {
    params.push(category);
    where.push(`l.category = $${params.length}`);
  }
  if (neighborhood && NEIGHBORHOODS.includes(neighborhood)) {
    params.push(neighborhood);
    where.push(`l.neighborhood = $${params.length}`);
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const orderSql = sort === 'oldest' ? 'ORDER BY l.created_at ASC' : 'ORDER BY l.created_at DESC';

  try {
    const sql = `
      SELECT l.*, u.nickname AS seller_nickname
      FROM cm_listings l
      JOIN cm_users u ON u.id = l.seller_id
      ${whereSql}
      ${orderSql}
      LIMIT 100
    `;
    const { rows } = await pool.query(sql, params);
    res.json({ listings: rows.map(listingRow) });
  } catch (e) {
    console.error('GET /api/listings error:', e);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 상세 (로그인 시 isFavorited 포함)
app.get('/api/listings/:id', authOptional, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '잘못된 상품 ID 입니다.' });
  try {
    const { rows } = await pool.query(`
      SELECT l.*, u.nickname AS seller_nickname
      FROM cm_listings l JOIN cm_users u ON u.id = l.seller_id
      WHERE l.id = $1
    `, [id]);
    if (rows.length === 0) return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });

    let isFavorited = false;
    if (req.user && req.user.sub) {
      const f = await pool.query(
        'SELECT 1 FROM cm_favorites WHERE user_id = $1 AND listing_id = $2 LIMIT 1',
        [req.user.sub, id]
      );
      isFavorited = f.rowCount > 0;
    }
    res.json({ listing: listingRow(rows[0]), isFavorited });
  } catch (e) {
    console.error('GET /api/listings/:id error:', e);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 등록
app.post('/api/listings', authRequired, async (req, res) => {
  const { title, price, description, category, imageUrls } = req.body || {};
  if (!title || typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 80) {
    return res.status(400).json({ error: '제목은 2~80자여야 합니다.' });
  }
  const numPrice = Number(price);
  if (!Number.isFinite(numPrice) || numPrice < 0 || numPrice > 100_000_000) {
    return res.status(400).json({ error: '가격은 0~1억 사이여야 합니다.' });
  }
  if (!description || typeof description !== 'string' || description.trim().length < 1 || description.trim().length > 2000) {
    return res.status(400).json({ error: '설명은 1~2000자여야 합니다.' });
  }
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `카테고리는 ${CATEGORIES.join(' / ')} 중 하나여야 합니다.` });
  }
  if (!Array.isArray(imageUrls) || imageUrls.length === 0 || imageUrls.length > 3) {
    return res.status(400).json({ error: '이미지는 1~3장 필요합니다.' });
  }
  for (const u of imageUrls) {
    if (typeof u !== 'string' || !/^https:\/\//.test(u)) {
      return res.status(400).json({ error: '이미지 URL 이 올바르지 않습니다.' });
    }
  }

  try {
    // 동네는 로그인 사용자 동네 자동 복사
    const ures = await pool.query('SELECT neighborhood FROM cm_users WHERE id = $1', [req.user.sub]);
    if (ures.rowCount === 0) return res.status(401).json({ error: '사용자를 찾을 수 없습니다.' });
    const neighborhood = ures.rows[0].neighborhood;

    const ins = await pool.query(`
      INSERT INTO cm_listings (seller_id, title, price, description, category, neighborhood, image_urls, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'ON_SALE')
      RETURNING *
    `, [req.user.sub, title.trim(), Math.round(numPrice), description.trim(), category, neighborhood, imageUrls]);

    const row = ins.rows[0];
    row.seller_nickname = null; // RETURNING 으로 가져오지 않으므로 클라가 다시 조회하거나 무시
    res.status(201).json({ listing: listingRow(row) });
  } catch (e) {
    console.error('POST /api/listings error:', e);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ====================================================================
// 관심 (cm_favorites) API
// ====================================================================

// 내 관심 목록 (listing 풀 정보 포함)
app.get('/api/favorites', authRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT l.*, u.nickname AS seller_nickname
      FROM cm_favorites f
      JOIN cm_listings l ON l.id = f.listing_id
      JOIN cm_users u    ON u.id = l.seller_id
      WHERE f.user_id = $1
      ORDER BY f.created_at DESC
    `, [req.user.sub]);
    res.json({ favorites: rows.map(listingRow) });
  } catch (e) {
    console.error('GET /api/favorites error:', e);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 내 관심한 listing id 목록 (가벼운 버전 — 홈/상세에서 하트 상태 표시용)
app.get('/api/favorites/ids', authRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT listing_id FROM cm_favorites WHERE user_id = $1',
      [req.user.sub]
    );
    res.json({ ids: rows.map(r => r.listing_id) });
  } catch (e) {
    console.error('GET /api/favorites/ids error:', e);
    res.status(500).json({ error: '서버 오류' });
  }
});

app.post('/api/favorites/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '잘못된 상품 ID 입니다.' });
  try {
    // listing 존재 확인
    const lc = await pool.query('SELECT 1 FROM cm_listings WHERE id = $1', [id]);
    if (lc.rowCount === 0) return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });

    await pool.query(
      `INSERT INTO cm_favorites (user_id, listing_id) VALUES ($1, $2)
       ON CONFLICT (user_id, listing_id) DO NOTHING`,
      [req.user.sub, id]
    );
    res.json({ ok: true, favorited: true });
  } catch (e) {
    console.error('POST /api/favorites/:id error:', e);
    res.status(500).json({ error: '서버 오류' });
  }
});

app.delete('/api/favorites/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '잘못된 상품 ID 입니다.' });
  try {
    await pool.query(
      'DELETE FROM cm_favorites WHERE user_id = $1 AND listing_id = $2',
      [req.user.sub, id]
    );
    res.json({ ok: true, favorited: false });
  } catch (e) {
    console.error('DELETE /api/favorites/:id error:', e);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ====================================================================
// 메시지/대화방 (cm_messages) API
// ====================================================================

function messageRow(r) {
  return {
    id: r.id,
    listingId: r.listing_id,
    senderId: r.sender_id,
    receiverId: r.receiver_id,
    body: r.body,
    createdAt: r.created_at,
  };
}

// 메시지 보내기
app.post('/api/messages', authRequired, async (req, res) => {
  const { listingId, receiverId, body } = req.body || {};
  const lid = parseInt(listingId, 10);
  if (!Number.isInteger(lid) || lid <= 0) return res.status(400).json({ error: '잘못된 상품 ID 입니다.' });
  if (!receiverId || typeof receiverId !== 'string') return res.status(400).json({ error: '받는 사람이 필요합니다.' });
  if (receiverId === req.user.sub) return res.status(400).json({ error: '본인에게는 보낼 수 없습니다.' });
  if (!body || typeof body !== 'string' || body.trim().length === 0 || body.length > 1000) {
    return res.status(400).json({ error: '메시지는 1~1000자여야 합니다.' });
  }

  try {
    // listing 존재 + receiver 존재 확인
    const lc = await pool.query('SELECT 1 FROM cm_listings WHERE id = $1', [lid]);
    if (lc.rowCount === 0) return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
    const uc = await pool.query('SELECT 1 FROM cm_users WHERE id = $1', [receiverId]);
    if (uc.rowCount === 0) return res.status(404).json({ error: '받는 사람을 찾을 수 없습니다.' });

    const ins = await pool.query(`
      INSERT INTO cm_messages (listing_id, sender_id, receiver_id, body)
      VALUES ($1,$2,$3,$4)
      RETURNING *
    `, [lid, req.user.sub, receiverId, body.trim()]);

    res.status(201).json({ message: messageRow(ins.rows[0]) });
  } catch (e) {
    console.error('POST /api/messages error:', e);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 대화방 메시지 목록 (listing_id + peer_id)
//   ?listingId=, ?peerId=, ?since= (이 id 보다 큰 것만)
app.get('/api/messages', authRequired, async (req, res) => {
  const lid = parseInt(req.query.listingId, 10);
  const peerId = req.query.peerId;
  const since = req.query.since != null ? parseInt(req.query.since, 10) : null;
  if (!Number.isInteger(lid) || lid <= 0) return res.status(400).json({ error: 'listingId 필요' });
  if (!peerId || typeof peerId !== 'string') return res.status(400).json({ error: 'peerId 필요' });

  try {
    const params = [lid, req.user.sub, peerId];
    let sinceSql = '';
    if (since != null && Number.isInteger(since) && since > 0) {
      params.push(since);
      sinceSql = `AND id > $${params.length}`;
    }
    const sql = `
      SELECT * FROM cm_messages
      WHERE listing_id = $1
        AND ((sender_id = $2 AND receiver_id = $3) OR (sender_id = $3 AND receiver_id = $2))
        ${sinceSql}
      ORDER BY created_at ASC, id ASC
      LIMIT 500
    `;
    const { rows } = await pool.query(sql, params);

    // 상대 정보 (peer info — UX 편의: 항상 채워줌)
    const u = await pool.query('SELECT id, nickname, neighborhood FROM cm_users WHERE id = $1', [peerId]);
    const peer = u.rows[0] || null;

    res.json({ messages: rows.map(messageRow), peer });
  } catch (e) {
    console.error('GET /api/messages error:', e);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 대화방 목록 — 내가 참여한 (listing_id, peer_id) 별 마지막 메시지 + 상품/상대 정보
app.get('/api/conversations', authRequired, async (req, res) => {
  try {
    const sql = `
      WITH ranked AS (
        SELECT
          m.*,
          CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END AS peer_id,
          ROW_NUMBER() OVER (
            PARTITION BY m.listing_id,
                         CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END
            ORDER BY m.created_at DESC, m.id DESC
          ) AS rn
        FROM cm_messages m
        WHERE m.sender_id = $1 OR m.receiver_id = $1
      )
      SELECT r.id, r.listing_id, r.peer_id, r.body, r.sender_id, r.created_at,
             l.title, l.price, l.image_urls, l.status,
             u.nickname AS peer_nickname, u.neighborhood AS peer_neighborhood
      FROM ranked r
      JOIN cm_listings l ON l.id = r.listing_id
      JOIN cm_users    u ON u.id = r.peer_id
      WHERE r.rn = 1
      ORDER BY r.created_at DESC
      LIMIT 100
    `;
    const { rows } = await pool.query(sql, [req.user.sub]);
    const conversations = rows.map(r => ({
      listingId:        r.listing_id,
      peerId:           r.peer_id,
      peerNickname:     r.peer_nickname,
      peerNeighborhood: r.peer_neighborhood,
      lastBody:         r.body,
      lastFromMe:       r.sender_id === req.user.sub,
      lastAt:           r.created_at,
      listing: {
        title: r.title,
        price: r.price,
        images: r.image_urls || [],
        status: r.status,
      },
    }));
    res.json({ conversations });
  } catch (e) {
    console.error('GET /api/conversations error:', e);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 삭제 (본인 가드)
app.delete('/api/listings/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '잘못된 상품 ID 입니다.' });
  try {
    const r = await pool.query(
      'DELETE FROM cm_listings WHERE id = $1 AND seller_id = $2 RETURNING id',
      [id, req.user.sub]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: '상품이 없거나 본인 글이 아닙니다.' });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/listings/:id error:', e);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ====================================================================
// 결제 (TossPayments)
// ====================================================================

// 클라이언트가 사용할 공개 설정
app.get('/api/config', (_req, res) => {
  res.json({ tossClientKey: TOSS_CLIENT_KEY });
});

// 메모리 기반 pending order 저장소 (5분 TTL)
const PENDING_TTL_MS = 5 * 60 * 1000;
const pendingOrders = new Map(); // orderId -> { userId, listingId, amount, orderName, createdAt }

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingOrders) {
    if (now - v.createdAt > PENDING_TTL_MS) pendingOrders.delete(k);
  }
}, 60 * 1000).unref?.();

function generateOrderId() {
  // 토스 권고: 6~64자, 영문/숫자/-/_
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `cm_${ts}_${rand}`;
}

// 1) 주문 생성 — 서버에서 amount/title을 결정 (위변조 방지)
app.post('/api/orders', authRequired, async (req, res) => {
  const { listingId } = req.body || {};
  const lid = parseInt(listingId, 10);
  if (!Number.isInteger(lid) || lid <= 0) return res.status(400).json({ error: '잘못된 상품 ID 입니다.' });

  try {
    const { rows } = await pool.query(
      'SELECT id, title, price, status, seller_id FROM cm_listings WHERE id = $1',
      [lid]
    );
    if (rows.length === 0) return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
    const l = rows[0];

    if (l.seller_id === req.user.sub) return res.status(400).json({ error: '본인 글은 구매할 수 없어요.' });
    if (l.status !== 'ON_SALE')        return res.status(409).json({ error: '판매중인 상품이 아닙니다.' });

    const orderId = generateOrderId();
    const orderName = l.title.length > 90 ? l.title.slice(0, 90) + '…' : l.title;
    pendingOrders.set(orderId, {
      userId: req.user.sub,
      listingId: lid,
      amount: l.price,
      orderName,
      createdAt: Date.now(),
    });

    res.json({
      orderId,
      orderName,
      amount: l.price,
      customerKey: String(req.user.sub),
    });
  } catch (e) {
    console.error('POST /api/orders error:', e);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 2) 결제 승인 — 토스 confirm + cm_listings.status='SOLD' (멱등)
app.post('/api/payments/confirm', authRequired, async (req, res) => {
  const { paymentKey, orderId, amount } = req.body || {};
  if (!paymentKey || !orderId || amount === undefined || amount === null) {
    return res.status(400).json({ error: 'paymentKey, orderId, amount는 필수입니다.' });
  }
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: '잘못된 결제 금액입니다.' });
  }

  // 멱등성 — 같은 paymentKey 처리된 게 있으면 그대로 성공
  try {
    const exist = await pool.query(
      'SELECT id, buyer_id FROM cm_listings WHERE payment_key = $1 LIMIT 1',
      [paymentKey]
    );
    if (exist.rowCount > 0) {
      return res.json({
        ok: true,
        listingId: exist.rows[0].id,
        alreadyProcessed: true,
      });
    }
  } catch (e) {
    console.error('confirm idempotency check failed:', e);
    return res.status(500).json({ error: '서버 오류' });
  }

  // pending order 검증
  const pending = pendingOrders.get(orderId);
  if (!pending) return res.status(400).json({ error: '주문 정보를 찾을 수 없습니다. (만료/위조)' });
  if (pending.userId !== req.user.sub) return res.status(403).json({ error: '해당 주문에 대한 권한이 없습니다.' });
  if (pending.amount !== numericAmount) {
    return res.status(400).json({ error: '결제 금액이 주문 금액과 일치하지 않습니다.' });
  }

  // listing 상태 다시 확인 (race condition: 다른 사람이 사이에 사면)
  try {
    const lc = await pool.query('SELECT status FROM cm_listings WHERE id = $1', [pending.listingId]);
    if (lc.rowCount === 0) return res.status(404).json({ error: '상품이 사라졌습니다.' });
    if (lc.rows[0].status !== 'ON_SALE') {
      return res.status(409).json({ error: '이미 거래완료된 상품입니다.' });
    }
  } catch (e) {
    console.error('listing status check failed:', e);
    return res.status(500).json({ error: '서버 오류' });
  }

  // 토스 confirm
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
    const tossResult = await r.json();
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

  // listing 갱신 (UNIQUE(payment_key) 가드 + ON_SALE 체크)
  try {
    const upd = await pool.query(`
      UPDATE cm_listings
         SET status = 'SOLD',
             buyer_id = $1,
             paid_at = NOW(),
             payment_key = $2,
             order_id = $3
       WHERE id = $4 AND status = 'ON_SALE'
       RETURNING id
    `, [pending.userId, paymentKey, orderId, pending.listingId]);

    if (upd.rowCount === 0) {
      // 다른 트랜잭션이 먼저 갱신
      return res.status(409).json({ error: '이미 거래완료된 상품입니다.' });
    }
    pendingOrders.delete(orderId);
    res.json({ ok: true, listingId: upd.rows[0].id });
  } catch (e) {
    console.error('listings SOLD update error:', e);
    res.status(500).json({ error: '결제는 승인되었으나 기록에 실패했습니다. 고객센터로 문의해 주세요.' });
  }
});

// ====================================================================
// 정적 파일 서빙
// ====================================================================
app.use(express.static(__dirname));

// 정의되지 않은 /api/* 는 명시적으로 404 (index.html 폴백 방지)
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// SPA 폴백
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ====================================================================
// 시작
// ====================================================================
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✓ Q5 carrot-repl running on http://localhost:${PORT}`);
  });
}

module.exports = app;
