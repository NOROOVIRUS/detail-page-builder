#!/usr/bin/env node
/**
 * server.mjs — 상세페이지 빌더 로컬 실행기
 *   http://127.0.0.1:7788/          빌더 화면 (index.html)
 *   GET  /health                    실행기 상태
 *   GET  /usage                     구독 사용량 (5시간·주간 한도 %)
 *   POST /generate                  Codex CLI 로 이미지 1장 생성 → PNG data URL + 사용량 반환, images/ 에 저장
 *                                   body: { prompt, file, refs?(제품 사진 1~4장, 여러 각도), model?(모델 사진) }
 *
 * 실행: node scripts/server.mjs --open   (실행기.bat 이 이걸 부름)
 * 보안: 127.0.0.1 에만 바인딩 + Host/Origin 이 자기 자신일 때만 생성 허용
 *       (Codex 는 작업 폴더 쓰기 권한이 있는 에이전트라, 아무 사이트나 호출하면 안 됨)
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findCodex, runCodex, findOutput, readUsage } from './codex.mjs';

const PORT = 7788;
const ORIGINS = [`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`];
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'images');          // 생성 결과 보관 (.gitignore)
const WORK = join(OUT, '.work');           // codex 작업 폴더 (고정)
const MAX_BODY = 20 * 1024 * 1024;         // 참조 사진 data URL 포함
const MAX_PARALLEL = 2;                    // 형님 지시: 2장씩 (3장 동시도 실측 52초 정상)
const CODEX = findCodex();
mkdirSync(WORK, { recursive: true });

/* 동시 실행 제한 대기열 */
let running = 0; const waiters = [];
const acquire = () => running < MAX_PARALLEL ? (running++, Promise.resolve()) : new Promise(r => waiters.push(r));
const release = () => { const n = waiters.shift(); n ? n() : running--; };

const send = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
};

const readBody = (req) => new Promise((ok, fail) => {
  let size = 0; const chunks = [];
  req.on('data', c => { size += c.length; if (size > MAX_BODY) { fail(new Error('too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
  req.on('error', fail);
});

/* 참조 사진: 같은 사진은 해시로 한 번만 파일로 씀 */
const refFile = (dataUrl) => {
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  const p = join(WORK, `ref-${createHash('sha1').update(buf).digest('hex').slice(0, 12)}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`);
  if (!existsSync(p)) writeFileSync(p, buf);
  return p;
};

/* 이미지 1장 생성 */
async function generate(req, res) {
  // 자기 자신(빌더 화면)이 보낸 요청만: 다른 사이트 호출 차단 (Host 는 아래 공통 검사)
  if (!ORIGINS.includes(req.headers.origin))
    return send(res, 403, { error: '허용되지 않은 요청입니다.' });
  if (!String(req.headers['content-type'] || '').startsWith('application/json'))
    return send(res, 415, { error: 'JSON 만 받습니다.' });
  let job;
  try { job = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: '요청을 읽을 수 없습니다.' }); }
  const { prompt, file, ref, model } = job || {};
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 3000) return send(res, 400, { error: '프롬프트가 비었거나 너무 깁니다.' });
  if (typeof file !== 'string' || !/^img-\d{2}-\d\.png$/.test(file)) return send(res, 400, { error: '파일 이름 형식이 틀렸습니다.' });
  const refList = job.refs !== undefined ? job.refs : (ref ? [ref] : []);
  if (!Array.isArray(refList) || refList.length > 4) return send(res, 400, { error: '제품 사진은 최대 4장입니다.' });
  const refPaths = refList.map(refFile);
  if (refPaths.some(p => !p)) return send(res, 400, { error: '제품 사진 형식이 틀렸습니다.' });
  const modelPath = model ? refFile(model) : null;
  if (model && !modelPath) return send(res, 400, { error: '모델 사진 형식이 틀렸습니다.' });

  await acquire();
  try {
    const t0 = Date.now();
    const { code, out } = await runCodex(CODEX, prompt, { cwd: WORK, refs: refPaths, model: modelPath });
    const src = findOutput(out);
    if (!src) {
      const tail = out.trim().split('\n').slice(-3).join(' / ').slice(0, 300);
      console.log(`✗ ${file} 실패 (exit ${code}) ${tail}`);
      const limited = /usage limit|rate limit|429|exceeded/i.test(out);
      return send(res, limited ? 429 : 502, { error: limited ? '구독 사용량 한도에 걸렸습니다.' : '이미지가 만들어지지 않았습니다.', detail: tail, usage: readUsage() });
    }
    copyFileSync(src, join(OUT, file));
    console.log(`✓ ${file} ${Math.round((Date.now() - t0) / 1000)}초`);
    send(res, 200, { file, dataUrl: 'data:image/png;base64,' + readFileSync(src).toString('base64'), usage: readUsage() });
  } finally { release(); }
}

const server = http.createServer(async (req, res) => {
  try {
    // 모든 경로 공통: Host 가 자기 주소가 아니면 거부 (DNS 리바인딩 차단)
    if (!ORIGINS.map(o => o.slice(7)).includes(req.headers.host)) return send(res, 403, { error: '허용되지 않은 요청입니다.' });
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(readFileSync(join(ROOT, 'index.html')));
    }
    if (req.method === 'GET' && url.pathname === '/usage') return send(res, 200, readUsage() || {});
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, parallel: MAX_PARALLEL });
    if (req.method === 'POST' && url.pathname === '/generate') return await generate(req, res);
    send(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: '실행기 오류: ' + e.message });
  }
});

const openChrome = () => spawn('cmd', ['/c', 'start', '', 'chrome', `http://127.0.0.1:${PORT}/`], { detached: true, stdio: 'ignore' }).unref();

server.on('error', e => {
  if (e.code === 'EADDRINUSE') { // 이미 켜져 있으면 창만 띄움
    console.log('실행기가 이미 켜져 있습니다. 크롬만 엽니다.');
    if (process.argv.includes('--open')) openChrome();
    setTimeout(() => process.exit(0), 500);
  } else { console.error(e); process.exit(1); }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`상세페이지 빌더 실행기 켜짐 → http://127.0.0.1:${PORT}/`);
  console.log(`Codex   : ${CODEX}`);
  console.log(`저장 위치: ${OUT}`);
  console.log('이 창을 닫으면 이미지 자동 생성이 멈춥니다.\n');
  if (process.argv.includes('--open')) openChrome();
});
