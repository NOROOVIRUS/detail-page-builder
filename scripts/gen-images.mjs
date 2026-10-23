#!/usr/bin/env node
/**
 * gen-images.mjs — 상세페이지 빌더의 이미지 프롬프트를 Codex CLI로 일괄 생성
 *
 * 사용법:
 *   node scripts/gen-images.mjs image-prompts.json
 *   node scripts/gen-images.mjs image-prompts.json --only A,B     (슬롯 필터)
 *   node scripts/gen-images.mjs image-prompts.json --out ./images
 *
 * 전제:
 *   - Codex CLI 설치 + ChatGPT 계정 로그인 (API 키 불필요, 추가 과금 없음)
 *   - Codex 경로를 모르면 환경변수 CODEX_BIN 으로 지정
 *
 * 동작:
 *   프롬프트마다 codex exec 를 실행하고, ~/.codex/generated_images/ 에
 *   새로 생긴 PNG 를 찾아 output 폴더로 복사한다.
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
const only = argv.includes('--only') && onlyArg ? onlyArg.split(',').map(s => s.trim().toUpperCase()) : null;
const outArg = argv[argv.indexOf('--out') + 1];
const outDir = resolve(argv.includes('--out') && outArg ? outArg : 'images');

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
const snapshot = () => {
  const set = new Set();
  if (!existsSync(GEN_DIR)) return set;
  for (const dir of readdirSync(GEN_DIR)) {
    const d = join(GEN_DIR, dir);
    if (!statSync(d).isDirectory()) continue;
    for (const f of readdirSync(d)) {
      if (f.toLowerCase().endsWith('.png')) set.add(join(d, f));
    }
  }
  return set;
};

const run = (prompt) => new Promise((done) => {
  const args = [
    'exec',
    '-C', outDir,
    '--skip-git-repo-check',
    '-s', 'workspace-write',
    prompt
  ];
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
const jobs = (spec.jobs || []).filter(j => !only || only.includes(String(j.slot).toUpperCase()));

if (!jobs.length) {
  console.error('실행할 작업이 없습니다. (--only 필터를 확인하세요)');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
console.log(`Codex   : ${CODEX}`);
console.log(`출력    : ${outDir}`);
console.log(`작업 수 : ${jobs.length}건 (1건당 약 60~90초)\n`);

let ok = 0, fail = 0;

for (const [i, job] of jobs.entries()) {
  const label = `[${i + 1}/${jobs.length}] #${job.index} slot ${job.slot}`;
  console.log(`${label} 생성 중...`);

  const before = snapshot();
  const prompt = `${job.prompt}\n\n${job.negative}`;
  const { code } = await run(prompt);
  const after = snapshot();

  // 새로 생긴 파일 찾기 (가장 최근)
  const created = [...after].filter(f => !before.has(f))
    .map(f => ({ f, t: statSync(f).mtimeMs }))
    .sort((a, b) => b.t - a.t);

  if (!created.length) {
    console.log(`  ✗ 실패 (exit ${code}) — 새 이미지가 감지되지 않았습니다.`);
    fail++;
    continue;
  }

  const dest = join(outDir, job.file);
  copyFileSync(created[0].f, dest);
  console.log(`  ✓ ${basename(dest)}`);
  ok++;
}

console.log(`\n완료: 성공 ${ok}건 / 실패 ${fail}건`);
console.log(`이미지는 ${outDir} 에 저장되었습니다. 빌더의 이미지 슬롯에 업로드하세요.`);
