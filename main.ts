// BREAKSITE — entrypoint for the threejs-fps-02 bounty (Node 22, standard library only).
//
// What this program does, in order:
//   1. Inventories the entry as it stands beside this file: every file under game/ and
//      screenshots/, with counts and byte totals, so an over-cap entry fails here with a
//      readable message instead of failing silently at the scorer.
//   2. Copies game/ and screenshots/ into the output directory (MAKEFUN_OUTPUT_DIR when
//      set, /output otherwise — the grader's mount point).
//   3. Writes dossier.json through the vendored make.fun library: the screenshots and the
//      game's text sources, capped exactly as the scorer caps them, are what the judge
//      reads. This file never touches the dossier's contents itself.
//   4. Verifies the hand-in: dossier.json exists, parses, and names the cover image.
//
// Play it locally with `node serve.ts` (http://localhost:8080); hand it in with
// `MAKEFUN_OUTPUT_DIR=out node main.ts` from this directory.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const CAPS = {
  textBytes: 163840, // the dossier's total text budget
  shotsMax: 4, // at most four screenshots
  shotBytes: 262144, // each at most 256 KiB
  gameFiles: 993, // at most 993 files under game/
  gameBytes: 50331648, // and at most 48 MiB of them
};

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// A recursive inventory: [relative path, byte size] for every file below dir.
function inventory(dir, base = dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...inventory(full, base));
    else found.push([full.slice(base.length + 1), statSync(full).size]);
  }
  return found;
}

function refuse(message) {
  console.error(`main.ts: refusing to hand in — ${message}`);
  process.exit(1);
}

// --- 1. Inventory and cap check -------------------------------------------------
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');
if (!existsSync(join(gameDir, 'index.html'))) refuse('game/index.html is missing');

const gameFiles = inventory(gameDir);
const gameBytes = gameFiles.reduce((sum, [, size]) => sum + size, 0);
if (gameFiles.length > CAPS.gameFiles) refuse(`game/ holds ${gameFiles.length} files, over the ${CAPS.gameFiles} cap`);
if (gameBytes > CAPS.gameBytes) refuse(`game/ totals ${gameBytes} bytes, over the ${CAPS.gameBytes} cap`);

const shotFiles = existsSync(shotsDir) ? inventory(shotsDir) : [];
if (shotFiles.length > CAPS.shotsMax) refuse(`${shotFiles.length} screenshots, over the ${CAPS.shotsMax} cap`);
for (const [name, size] of shotFiles) {
  if (size > CAPS.shotBytes) refuse(`screenshot ${name} is ${size} bytes, over the ${CAPS.shotBytes} cap`);
}
console.log(`main.ts: game/ ${gameFiles.length} files, ${gameBytes} bytes; screenshots/ ${shotFiles.length} files`);

// --- 2. Copy the entry to the output directory ----------------------------------
mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (shotFiles.length > 0) cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// --- 3. The dossier, built by the vendored library under the scorer's caps ------
const dossierText = buildDossier(out, {
  text_max_bytes: CAPS.textBytes,
  screenshots: { max: CAPS.shotsMax, max_bytes: CAPS.shotBytes },
  game_max_files: CAPS.gameFiles,
  game_max_bytes: CAPS.gameBytes,
});
writeFileSync(join(out, 'dossier.json'), dossierText);

// --- 4. Verify the hand-in -------------------------------------------------------
const dossier = JSON.parse(readFileSync(join(out, 'dossier.json'), 'utf8'));
if (!Array.isArray(dossier.images) || dossier.images.length === 0) refuse('dossier.json names no screenshots');
console.log(`main.ts: dossier.json written (${dossierText.length} bytes, cover = image ${dossier.cover})`);
