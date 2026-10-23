#!/usr/bin/env node
/**
 * gen-images.mjs — 상세페이지 빌더의 이미지 프롬프트를 Codex CLI로 일괄 생성
 *
 * 사용법:
 *   node scripts/gen-images.mjs image-prompts.json
 *   node scripts/gen-images.mjs image-prompts.json --ref 내제품사진.jpg   (폰카 사진 참조)
 *   node scripts/gen-images.mjs image-prompts.json --only 1,5,9   (슬롯 번호 지정)
 *   node scripts/gen-images.mjs image-prompts.json --kind 3       (종류별: 1라이프 2매크로 3스튜디오 4GIF)
 *   node scripts/gen-images.mjs image-prompts.json --out ./images
 *   node scripts/gen-images.mjs image-prompts.json --jobs 3       (동시 3장씩 생성)
 *
 * 전제:
 *   - Codex CLI 설치 + ChatGPT 계정 로그인 (API 키 불필요, 추가 과금 없음)
 *   - Codex 경로를 모르면 환경변수 CODEX_BIN 으로 지정
 *
 * 동작:
 *   프롬프트마다 codex exec 를 실행하고, 출력에 찍힌 session id 로
 *   ~/.codex/generated_images/<session id>/ 의 PNG 를 찾아 output 폴더로 복사한다.
 *   (세션별 폴더라 --jobs 로 동시에 돌려도 결과가 섞이지 않는다)
 */

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename, resolve } from 'node:path';

/* ---------- args ---------- */
const argv = process.argv.slice(2);
const jsonPath = argv.find(a => a.endsWith('.json'));
if (!jsonPath) {
  console.error('사용법: node scripts/gen-images.mjs <image-prompts.json> [--only A,B] [--out DIR]');
  process.exit(1);
}
const onlyArg = argv[argv.indexOf('--only') + 1];
const only = argv.includes('--only') && onlyArg
  ? onlyArg.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n))
  : null;
const kindArg = argv[argv.indexOf('--kind') + 1];
const kinds = argv.includes('--kind') && kindArg
  ? kindArg.split(',').map(s => s.trim())
  : null;
const outArg = argv[argv.indexOf('--out') + 1];
const outDir = resolve(argv.includes('--out') && outArg ? outArg : 'images');
const refArg = argv[argv.indexOf('--ref') + 1];
const REF = argv.includes('--ref') && refArg ? resolve(refArg) : null;
const jobsArg = argv[argv.indexOf('--jobs') + 1];
const JOBS = argv.includes('--jobs') ? Math.max(1, Math.min(6, Number(jobsArg) || 1)) : 1;
if (REF && !existsSync(REF)) {
  console.error(`--ref 파일을 찾을 수 없습니다: ${REF}`);
  process.exit(1);
}

/* ---------- locate codex ---------- */
function findCodex() {
  if (process.env.CODEX_BIN && existsSync(process.env.CODEX_BIN)) return process.env.CODEX_BIN;

  const home = homedir();
  const roots = [
    join(home, 'AppData', 'Local', 'OpenAI', 'Codex', 'bin'),
    join(home, '.local', 'bin'),
    '/usr/local/bin', '/opt/homebrew/bin'
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    // Windows: bin/<hash>/codex.exe  ·  Unix: bin/codex
    if (statSync(root).isDirectory()) {
      const direct = join(root, 'codex');
      if (existsSync(direct)) return direct;
      for (const sub of readdirSync(root)) {
        const p = join(root, sub, 'codex.exe');
        if (existsSync(p)) return p;
      }
    }
  }
  return 'codex'; // PATH fallback
}

const CODEX = findCodex();
const GEN_DIR = join(homedir(), '.codex', 'generated_images');

/* ---------- helpers ---------- */
// codex exec 출력의 "session id: <uuid>" → 그 세션 폴더의 최신 PNG
const findOutput = (out) => {
  const m = /session id:\s*([0-9a-f-]{36})/i.exec(out);
  if (!m) return null;
  const d = join(GEN_DIR, m[1]);
  if (!existsSync(d)) return null;
  const pngs = readdirSync(d).filter(f => f.toLowerCase().endsWith('.png'))
    .map(f => ({ f: join(d, f), t: statSync(join(d, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  return pngs.length ? pngs[0].f : null;
};

const run = (prompt) => new Promise((done) => {
  const args = [
    'exec',
    '-C', outDir,
    '--skip-git-repo-check',
    '-s', 'workspace-write'
  ];
  if (REF) args.push(`--image=${REF}`);
  args.push(prompt);
  const p = spawn(CODEX, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', d => { out += d.toString(); });
  p.stderr.on('data', d => { out += d.toString(); });
  const timer = setTimeout(() => { try { p.kill(); } catch {} }, 5 * 60 * 1000);
  p.on('close', code => { clearTimeout(timer); done({ code, out }); });
  p.on('error', err => { clearTimeout(timer); done({ code: -1, out: String(err) }); });
});

/* ---------- main ---------- */
const spec = JSON.parse(readFileSync(jsonPath, 'utf8'));
const jobs = (spec.jobs || []).filter(j => {
  if (only && !only.includes(Number(j.index))) return false;
  if (kinds && !kinds.includes(String(j.slot))) return false;
  return true;
});

if (!jobs.length) {
  console.error('실행할 작업이 없습니다. (--only / --kind 필터를 확인하세요)');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
console.log(`Codex   : ${CODEX}`);
console.log(`출력    : ${outDir}`);
if (REF) console.log(`참조 이미지: ${REF}`);
console.log(`작업 수 : ${jobs.length}건 · 동시 ${JOBS}개 (1건당 약 50~90초)\n`);

const REF_NOTE = REF
  ? '[참조 이미지] 첨부한 사진과 같은 제품을 그대로 유지하세요. 제품의 형태·색상·비율·로고 위치를 바꾸지 말고, 배경과 조명·구도만 아래 지시에 맞게 바꿔서 새 이미지를 만드세요. 제품이 사진과 다르게 변형되면 실패입니다.\n\n'
  : '';

let ok = 0, fail = 0, next = 0;
const t0 = Date.now();

const one = async (i, job) => {
  const label = `[${i + 1}/${jobs.length}] #${job.index} slot ${job.slot}`;
  console.log(`${label} 생성 시작`);
  const prompt = `${REF_NOTE}${job.prompt}\n\n${job.negative}`;
  const { code, out } = await run(prompt);
  const src = findOutput(out);
  if (!src) {
    const tail = out.trim().split('\n').slice(-3).join(' / ').slice(0, 300);
    console.log(`${label} ✗ 실패 (exit ${code}) — 새 이미지가 감지되지 않았습니다.${tail ? '\n    마지막 출력: ' + tail : ''}`);
    fail++;
    return;
  }
  const dest = join(outDir, job.file);
  copyFileSync(src, dest);
  console.log(`${label} ✓ ${basename(dest)}`);
  ok++;
};

// 작업자 JOBS 개가 대기열에서 하나씩 꺼내 간다
await Promise.all(Array.from({ length: Math.min(JOBS, jobs.length) }, async () => {
  while (next < jobs.length) { const i = next++; await one(i, jobs[i]); }
}));

console.log(`\n완료: 성공 ${ok}건 / 실패 ${fail}건 · 소요 ${Math.round((Date.now() - t0) / 1000)}초`);
console.log(`이미지는 ${outDir} 에 저장되었습니다. 빌더 왼쪽 '여러 장을 여기에' 칸에 한 번에 떨어뜨리면 번호대로 들어갑니다.`);
