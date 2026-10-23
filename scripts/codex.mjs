/**
 * codex.mjs — Codex CLI 이미지 생성 공용 모듈 (gen-images.mjs · server.mjs 가 같이 씀)
 * ChatGPT 구독 인증으로 내장 image_gen 을 호출 → API 키·추가 과금 없음.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/* Codex 실행 파일 위치: CODEX_BIN > Windows 설치 폴더 > PATH */
export function findCodex() {
  if (process.env.CODEX_BIN && existsSync(process.env.CODEX_BIN)) return process.env.CODEX_BIN;
  const home = homedir();
  const roots = [
    join(home, 'AppData', 'Local', 'OpenAI', 'Codex', 'bin'),
    join(home, '.local', 'bin'),
    '/usr/local/bin', '/opt/homebrew/bin'
  ];
  for (const root of roots) {
    if (!existsSync(root) || !statSync(root).isDirectory()) continue;
    // Windows: bin/<hash>/codex.exe  ·  Unix: bin/codex
    const direct = join(root, 'codex');
    if (existsSync(direct)) return direct;
    for (const sub of readdirSync(root)) {
      const p = join(root, sub, 'codex.exe');
      if (existsSync(p)) return p;
    }
  }
  return 'codex';
}

export const GEN_DIR = join(homedir(), '.codex', 'generated_images');

export const REF_NOTE = '[참조 이미지] 첨부한 사진과 같은 제품을 그대로 유지하세요. 제품의 형태·색상·비율·로고 위치를 바꾸지 말고, 배경과 조명·구도만 아래 지시에 맞게 바꿔서 새 이미지를 만드세요. 제품이 사진과 다르게 변형되면 실패입니다.\n\n';

/* codex exec 1회. stdin 은 반드시 닫는다(안 닫으면 "Reading additional input from stdin" 무한 대기) */
export function runCodex(codex, prompt, { cwd, ref } = {}) {
  return new Promise((done) => {
    const args = ['exec', '-C', cwd, '--skip-git-repo-check', '-s', 'workspace-write'];
    if (ref) args.push(`--image=${ref}`); // -i 는 뒤 인자까지 삼키므로 반드시 등호 형태
    args.push(ref ? REF_NOTE + prompt : prompt);
    const p = spawn(codex, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', d => { out += d.toString(); });
    p.stderr.on('data', d => { out += d.toString(); });
    const timer = setTimeout(() => { try { p.kill(); } catch {} }, 5 * 60 * 1000);
    p.on('close', code => { clearTimeout(timer); done({ code, out }); });
    p.on('error', err => { clearTimeout(timer); done({ code: -1, out: String(err) }); });
  });
}

/* 출력의 "session id: <uuid>" → ~/.codex/generated_images/<uuid>/ 최신 PNG (세션별 폴더라 병렬 안전) */
export function findOutput(out) {
  const m = /session id:\s*([0-9a-f-]{36})/i.exec(out);
  if (!m) return null;
  const d = join(GEN_DIR, m[1]);
  if (!existsSync(d)) return null;
  const pngs = readdirSync(d).filter(f => f.toLowerCase().endsWith('.png'))
    .map(f => ({ f: join(d, f), t: statSync(join(d, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  return pngs.length ? pngs[0].f : null;
}
