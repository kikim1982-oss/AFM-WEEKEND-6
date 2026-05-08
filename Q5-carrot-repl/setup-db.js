// Q5 carrot-repl — cm_* 테이블 마이그레이션 + 시드
// 단계 2: cm_users
// 단계 3: cm_listings 추가 (도자기 이미지 8개 시드)
// 이후 단계: cm_favorites, cm_messages
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: { rejectUnauthorized: false },
});

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS cm_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname TEXT NOT NULL,
  neighborhood TEXT NOT NULL CHECK (neighborhood IN ('망원동','연남동')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cm_listings (
  id SERIAL PRIMARY KEY,
  seller_id UUID NOT NULL REFERENCES cm_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 0),
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  image_urls TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ON_SALE' CHECK (status IN ('ON_SALE','RESERVED','SOLD')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cm_listings_recent   ON cm_listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cm_listings_category ON cm_listings(category);
CREATE INDEX IF NOT EXISTS idx_cm_listings_seller   ON cm_listings(seller_id);

-- 단계 7 결제 컬럼 (별도 결제 테이블 안 만들고 인라인)
ALTER TABLE cm_listings
  ADD COLUMN IF NOT EXISTS buyer_id    UUID REFERENCES cm_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_key TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS order_id    TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS cm_favorites (
  user_id    UUID    NOT NULL REFERENCES cm_users(id)    ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES cm_listings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, listing_id)
);
CREATE INDEX IF NOT EXISTS idx_cm_favorites_user ON cm_favorites(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cm_messages (
  id          SERIAL  PRIMARY KEY,
  listing_id  INTEGER NOT NULL REFERENCES cm_listings(id) ON DELETE CASCADE,
  sender_id   UUID    NOT NULL REFERENCES cm_users(id)    ON DELETE CASCADE,
  receiver_id UUID    NOT NULL REFERENCES cm_users(id)    ON DELETE CASCADE,
  body        TEXT    NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CHECK (sender_id <> receiver_id)
);
CREATE INDEX IF NOT EXISTS idx_cm_msg_room   ON cm_messages(listing_id, sender_id, receiver_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cm_msg_recent ON cm_messages(receiver_id, created_at DESC);
`;

const SEED_USERS = [
  { email: 'mangwon@test.com', password: '12345678', nickname: '망원도예가', neighborhood: '망원동' },
  { email: 'yeonnam@test.com', password: '12345678', nickname: '연남러버',   neighborhood: '연남동' },
];

// Q1 dalhangari ImageKit 도자기 자산 8개 — 시드 유저들에게 분배
const POT = [
  'https://ik.imagekit.io/kikim1982/dalhangari/products/product-1_gvG_qq5SB.jpg',
  'https://ik.imagekit.io/kikim1982/dalhangari/products/product-2_NAK0GfxOQC.jpg',
  'https://ik.imagekit.io/kikim1982/dalhangari/products/product-3_1ZdfD3aOH.jpg',
  'https://ik.imagekit.io/kikim1982/dalhangari/products/product-4_Fq6K0Dudlx.jpg',
  'https://ik.imagekit.io/kikim1982/dalhangari/products/product-5_xmBO763j3.jpg',
  'https://ik.imagekit.io/kikim1982/dalhangari/products/product-6_EzYmp40VUc.jpg',
];

// 시드 listings — sellerEmail 로 sellerId 매핑
const SEED_LISTINGS = [
  { sellerEmail:'mangwon@test.com', title:'백자 막사발 (거의 새 것)',     price:25000, category:'도자기',   description:'단정한 곡선과 깊은 백색이 어우러진 막사발입니다. 작가 직접 빚은 것 받았다가 사용 한 번도 안 하고 보관해뒀어요.', images:[POT[0]],          status:'ON_SALE'  },
  { sellerEmail:'yeonnam@test.com', title:'분청 라운드 접시 2장 일괄',    price:40000, category:'도자기',   description:'분청사기 라운드 접시 2장. 한 장은 살짝 사용감 있고 한 장은 새 것입니다. 직거래 환영해요.',                       images:[POT[1], POT[3]], status:'ON_SALE'  },
  { sellerEmail:'mangwon@test.com', title:'청자 손잡이없는 찻잔 4P 세트', price:60000, category:'도자기',   description:'맑고 은은한 청자색이 차의 빛깔을 더욱 깊게 비춰줍니다. 4잔 세트로 정리합니다.',                              images:[POT[2]],          status:'RESERVED' },
  { sellerEmail:'yeonnam@test.com', title:'매트블랙 파스타볼 (한 번 사용)', price:35000, category:'도자기', description:'깊고 넓은 형태에 무광 검정. 한 번 사용했고 깨끗하게 보관 중입니다.',                                          images:[POT[3]],          status:'ON_SALE'  },
  { sellerEmail:'mangwon@test.com', title:'옹기 양념 항아리 (뚜껑 포함)', price:30000, category:'도자기',   description:'옹기 미니 항아리. 발효/장 보관용으로 좋아요. 뚜껑까지 같이 드려요.',                                         images:[POT[4]],          status:'SOLD'     },
  { sellerEmail:'yeonnam@test.com', title:'다완 (작가 사인 있음)',         price:75000, category:'도자기',  description:'거친 흙 결과 자연스러운 비대칭이 살아 있는 다완. 작가 사인 그대로 있습니다.',                               images:[POT[5]],          status:'ON_SALE'  },
  { sellerEmail:'mangwon@test.com', title:'안 쓰는 무선 키보드',           price:18000, category:'전자기기', description:'몇 번 안 쓴 무선 키보드입니다. AAA 건전지 2개 들어가요.',                                                  images:[POT[3]],          status:'ON_SALE'  },
  { sellerEmail:'yeonnam@test.com', title:'겨울 코트 새 상품 (M)',         price:55000, category:'의류',     description:'구매 후 한 번도 안 입은 겨울 코트. 사이즈 M.',                                                                  images:[POT[1]],          status:'ON_SALE'  },
];

async function main() {
  const client = await pool.connect();
  try {
    console.log('▶ 스키마 적용 중...');
    await client.query(SCHEMA_SQL);
    console.log('  ✓ cm_users / cm_listings 적용 완료');

    // --- cm_users 시드
    const { rows: ucnt } = await client.query('SELECT COUNT(*)::int AS n FROM cm_users');
    if (ucnt[0].n > 0) {
      console.log(`▶ cm_users 이미 ${ucnt[0].n}건 — 시드 건너뜀`);
    } else {
      console.log('▶ 시드 사용자 2명 생성 중...');
      for (const u of SEED_USERS) {
        const hash = await bcrypt.hash(u.password, 10);
        await client.query(
          `INSERT INTO cm_users (email, password_hash, nickname, neighborhood)
           VALUES ($1,$2,$3,$4)`,
          [u.email, hash, u.nickname, u.neighborhood]
        );
        console.log(`  ✓ ${u.email} (${u.nickname} · ${u.neighborhood}) — pw: ${u.password}`);
      }
    }

    // --- cm_listings 시드
    const { rows: lcnt } = await client.query('SELECT COUNT(*)::int AS n FROM cm_listings');
    if (lcnt[0].n > 0) {
      console.log(`▶ cm_listings 이미 ${lcnt[0].n}건 — 시드 건너뜀`);
    } else {
      console.log('▶ 시드 상품 8개 생성 중...');
      // sellerEmail → (id, neighborhood) 매핑
      const userMap = new Map();
      const ures = await client.query('SELECT id, email, neighborhood FROM cm_users');
      for (const r of ures.rows) userMap.set(r.email, { id: r.id, neighborhood: r.neighborhood });

      for (const l of SEED_LISTINGS) {
        const u = userMap.get(l.sellerEmail);
        if (!u) {
          console.warn(`  ⚠ ${l.sellerEmail} 사용자 없음 — 스킵`);
          continue;
        }
        await client.query(
          `INSERT INTO cm_listings (seller_id, title, price, description, category, neighborhood, image_urls, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [u.id, l.title, l.price, l.description, l.category, u.neighborhood, l.images, l.status]
        );
        console.log(`  ✓ [${l.sellerEmail.split('@')[0].padEnd(8)}] ${l.title} (${l.price.toLocaleString()}원, ${l.status})`);
      }
    }

    // 요약
    const summary = await client.query(`
      SELECT 'cm_users' tbl, COUNT(*)::int n FROM cm_users
      UNION ALL SELECT 'cm_listings',  COUNT(*) FROM cm_listings
      UNION ALL SELECT 'cm_favorites', COUNT(*) FROM cm_favorites
      UNION ALL SELECT 'cm_messages',  COUNT(*) FROM cm_messages
    `);
    console.log('\n현재 테이블 상태:');
    for (const r of summary.rows) console.log(`  ${r.tbl.padEnd(14)} ${r.n}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('❌ 실패:', e.message);
  process.exit(1);
});
