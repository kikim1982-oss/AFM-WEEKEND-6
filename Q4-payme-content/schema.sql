-- Q4 유료콘텐츠 잠금해제 미니앱 스키마
-- 대상 DB: Supabase Postgres (전용 Auth 미사용, 자체 JWT 인증)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 사용자 (자체 인증, 이메일 + 8자리 숫자 비밀번호)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 콘텐츠 (주식 분석 리포트 PDF)
CREATE TABLE IF NOT EXISTS contents (
  id SERIAL PRIMARY KEY,
  ticker TEXT NOT NULL,
  title TEXT NOT NULL,
  preview TEXT NOT NULL,
  category TEXT,
  price INTEGER NOT NULL CHECK (price >= 0),
  pdf_path TEXT,
  published_at DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 구매 내역
CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id INTEGER NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PAID',
  payment_key TEXT,
  order_id TEXT,
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, content_id)
);

CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_content ON purchases(content_id);
CREATE INDEX IF NOT EXISTS idx_contents_category ON contents(category);
