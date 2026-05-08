// Vercel serverless 진입점 — 모든 /api/* 요청은 vercel.json 의 rewrite 로 이 함수로 들어옴.
// req.url 은 원래 경로(/api/auth/me 등) 그대로 유지되어 Express 라우터가 매칭함.
module.exports = require('../server.js');
