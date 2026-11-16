// BREAKSITE — boot and the one loop. A fixed 60 Hz simulation (player, weapon,
// bots, match, combat) feeding a render at the display's rate. The player is a
// Warden: buy in the frozen 12 seconds, hold Foundry Yard for 100, defuse if the
// Jackals plant. First team to 7 rounds takes the match.
//
// ?shot=buy|site|clash|plant with &seed=N sets up a deterministic scene for a
// capture: it fast-forwards the real simulation (never a staged fake), renders
// twice, then freezes and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS } from './weapon.js';
import { createBots } from './bots.js';
import { createCombat } from './combat.js';
import { createHud } from './hud.js';
import { createMatch, BUY_TIME } from './match.js';
import { sfx } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(seed * 7919 + 13);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 30, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 220);
scene.add(camera);

// Dusk light: a low warm sun, a cool sky fill, and the yard's own lamps (in world).
const sun = new THREE.DirectionalLight(new THREE.Color(PALETTE.lamp), 1.1);
sun.position.set(-18, 26, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
scene.add(sun);
scene.add(new THREE.HemisphereLight(new THREE.Color(PALETTE.sky), new THREE.Color(PALETTE.asphalt), 1.0));

const world = createWorld(scene);
const player = createPlayer(world.colliders);
const body = player.state;
const weapon = createWeapon(camera);
const hud = createHud();
const bots = createBots(scene, world, rng);

// The player as an actor in the shared combat/match world.
const proxy = {
  kind: 'player',
  name: 'You',
  team: 'warden',
  hp: 100,
  armor: false,
  hasKit: false,
  alive: true,
  pos: body.position,
  eyePos() { return new THREE.Vector3(body.position.x, body.position.y + body.eye, body.position.z); },
  chestPos() { return new THREE.Vector3(body.position.x, body.position.y + 1.15, body.position.z); },
  headPos() { return new THREE.Vector3(body.position.x, body.position.y + 1.55, body.position.z); },
  groundSpeed() { return player.groundSpeed(); },
};

let simNow = 0;
let shake = 0;
let shotsFired = 0;

const combat = createCombat(scene, world, {
  onShot(shooter, def) {
    shotsFired += 1;
    sfx.shot(def.id, shooter !== proxy);
  },
  onDamage(victim, amount, attacker, part) {
    if (victim === proxy) {
      hud.damageFlash();
      sfx.hurt();
    } else if (attacker === proxy) {
      hud.hitmark(part === 'head');
      sfx.hit(part === 'head');
    }
  },
  onKill(victim, attacker, weaponId, headshot) {
    if (victim === proxy) proxy.alive = false;
    if (attacker === proxy) sfx.kill();
    match.handleKill(victim, attacker, weaponId, headshot);
  },
});

const overlay = document.getElementById('overlay');
const overlayCopy = document.getElementById('overlay-copy');
const playButton = document.getElementById('play');
let matchStarted = false;
let buyRendered = false;

const match = createMatch({
  scene,
  world,
  bots,
  player: proxy,
  hud,
  sfx,
  combat,
  rng,
  placePlayer(spawn) {
    body.position.copy(spawn);
    body.velocity.set(0, 0, 0);
    body.yaw = 0; // player convention: yaw 0 faces -Z, north, toward the site
    body.pitch = 0;
    weapon.roundReset(false);
    weapon.setVisible(true);
    hud.spectate(null);
  },
  playerOwns: (id) => weapon.owned(id),
  playerGive: (id) => { weapon.give(id); weapon.switchTo(id); },
  playerLostGear: () => {
    weapon.roundReset(true);
    proxy.armor = false;
    proxy.hasKit = false;
  },
  events: {
    onRoundStart() { buyRendered = false; },
    onExplode() { shake = 1; },
    onMatchEnd(winnerTeam, w, j) {
      overlayCopy.textContent = winnerTeam === 'warden'
        ? `The Yard holds. Final score — Wardens ${w} : ${j} Jackals. Reload the page to run it back.`
        : `The Jackals take Foundry Yard, ${j} : ${w}. Reload the page to run it back.`;
      playButton.textContent = 'Match over';
      overlay.hidden = false;
      if (document.pointerLockElement) document.exitPointerLock();
    },
  },
});

const input = createInput(renderer.domElement, onLockChange);

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    overlay.hidden = true;
    hud.hint(null);
  } else if (matchStarted && !match.over && match.phase !== 'buy' && proxy.alive) {
    overlayCopy.textContent = 'Paused. The round is still running — click to get back in.';
    playButton.textContent = 'Back in';
    overlay.hidden = false;
  }
}

playButton.addEventListener('click', () => {
  sfx.unlock();
  if (!matchStarted) {
    matchStarted = true;
    match.start();
  }
  if (!match.over) input.requestLock();
});

renderer.domElement.addEventListener('click', () => {
  if (shot || !matchStarted || match.over) return;
  if ((match.phase === 'live' || match.phase === 'planted') && proxy.alive && !input.state.locked) {
    input.requestLock();
  }
});

// Weapon switching on the wheel; digits buy during the buy phase, switch otherwise.
window.addEventListener('wheel', () => {
  if (!proxy.alive || match.phase === 'buy') return;
  const primary = weapon.primaryId();
  if (!primary) return;
  weapon.switchTo(weapon.state().id === primary ? 'p9' : primary);
}, { passive: true });

window.addEventListener('keydown', (event) => {
  if (shot) return;
  if (event.code === 'KeyR' && proxy.alive) {
    weapon.reload();
    if (weapon.state().reloading) sfx.reload();
  }
  if (match.phase === 'buy' && /^Digit[1-6]$/.test(event.code)) {
    const item = match.getBuyMenu()[Number(event.code.slice(5)) - 1];
    if (item && match.playerBuy(item.id)) refreshBuyMenu();
    return;
  }
  if (event.code === 'Digit1') { const p = weapon.primaryId(); if (p) weapon.switchTo(p); }
  if (event.code === 'Digit2') weapon.switchTo('p9');
});

function refreshBuyMenu() {
  hud.showBuy(match.getBuyMenu(), match.playerMoney(), (id) => {
    if (match.playerBuy(id)) refreshBuyMenu();
  });
  buyRendered = true;
}

// --- firing -------------------------------------------------------------------
let prevFiring = false;
const fireDir = new THREE.Vector3();
function tryFire() {
  const def = weapon.current();
  if (!def.auto && prevFiring) return; // semi-automatic: one click, one shot
  if (!weapon.canFire()) return;
  if (!weapon.takeRound()) {
    sfx.dryFire();
    weapon.reload();
    if (weapon.state().reloading) sfx.reload();
    weapon.pullTrigger();
    return;
  }
  weapon.pullTrigger();
  const spread = weapon.spread(player.groundSpeed(), !body.onGround);
  const origin = camera.position.clone();
  for (let pellet = 0; pellet < def.pellets; pellet += 1) {
    camera.getWorldDirection(fireDir);
    fireDir.x += (rng() * 2 - 1) * spread;
    fireDir.y += (rng() * 2 - 1) * spread;
    fireDir.z += (rng() * 2 - 1) * spread;
    fireDir.normalize();
    combat.traceShot(proxy, origin, fireDir.clone(), def, bots.all);
  }
  const kick = def.id === 'longbow' ? 0.035 : def.id === 'breacher' ? 0.028 : 0.011;
  player.recoil(kick + rng() * 0.004, (rng() * 2 - 1) * 0.004);
}

// --- the loop -------------------------------------------------------------------
function stepSim(dt) {
  simNow += dt;
  const phase = match.phase;
  if (proxy.alive && (phase === 'live' || phase === 'planted')) {
    player.step(dt, input.state.keys);
  }
  if (proxy.alive && (phase === 'live' || phase === 'planted') && input.state.firing) tryFire();
  prevFiring = input.state.firing;
  weapon.step(dt);
  match.update(dt, { defuseHeld: input.state.keys.has('KeyE') }, simNow);
  combat.step(dt, simNow);
}

function syncCamera() {
  if (!proxy.alive && matchStarted) {
    // Spectate the first living Warden; if none, watch the site from above.
    const mate = bots.wardens.find((b) => b.alive);
    if (mate) {
      camera.position.copy(mate.eyePos());
      const f = mate.facing();
      camera.rotation.set(0, Math.atan2(-f.x, -f.z), 0, 'YXZ');
      hud.spectate(mate.name);
    } else {
      camera.position.set(-4.6, 6.5, -4);
      camera.lookAt(world.sites.A.center.x, 0, world.sites.A.center.z);
      hud.spectate('—');
    }
    return;
  }
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  if (shake > 0.004) {
    camera.position.x += (rng() - 0.5) * shake * 0.35;
    camera.position.y += (rng() - 0.5) * shake * 0.35;
  }
}

let accumulator = 0;
let lastTime = performance.now();
let wasAlive = true;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  shake *= Math.pow(0.015, dt);
  if (matchStarted) {
    const look = input.takeLook();
    if (proxy.alive) player.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      stepSim(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    // Buy menu lifecycle.
    if (match.phase === 'buy' && proxy.alive && !buyRendered) refreshBuyMenu();
    if (match.phase !== 'buy' && buyRendered) { hud.hideBuy(); buyRendered = false; }
    if ((match.phase === 'live' || match.phase === 'planted') && proxy.alive && !input.state.locked && !shot) {
      hud.hint('CLICK TO AIM');
    } else if (input.state.locked) {
      hud.hint(null);
    }
    // Spectate transitions hide or restore the hands.
    if (proxy.alive !== wasAlive) {
      wasAlive = proxy.alive;
      weapon.setVisible(proxy.alive);
      if (proxy.alive) hud.spectate(null);
    }
    hud.setVitals(proxy.hp, proxy.armor);
    hud.setAmmo(weapon.state(), weapon.current().name);
    const spreadPx = Math.round(5 + weapon.spread(player.groundSpeed(), !body.onGround) * 620);
    hud.setCrosshair(proxy.alive, Math.min(26, spreadPx));
  }
  syncCamera();
  renderer.render(scene, camera);
}

// --- screenshot harness -----------------------------------------------------------
function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
}

function stepSimUntil(seconds, until) {
  const maxSteps = Math.ceil(seconds / FIXED_STEP);
  for (let i = 0; i < maxSteps; i += 1) {
    stepSim(FIXED_STEP);
    if (until && until()) return true;
  }
  return false;
}

function runShot(name) {
  overlay.hidden = true;
  matchStarted = true;
  match.start();
  const siteCenter = world.sites.A.center;
  if (name === 'buy') {
    refreshBuyMenu();
    aimAt(new THREE.Vector3(-12, 1.4, -10));
  } else if (name === 'site' || name === 'plant') {
    stepSimUntil(BUY_TIME + 0.5);
    // The carrier starts a step from the plant zone, and the two site Wardens are
    // held at mid and Long — the plant lands before the retake arrives, every time.
    const carrier = bots.jackals[4];
    carrier.pos.set(-15, 0, -13);
    carrier.setTask({ type: 'plant', x: siteCenter.x, z: siteCenter.z });
    bots.wardens[0].pos.set(-7.9, 0, -0.9);
    bots.wardens[0].setTask({ type: 'guard', x: -7.9, z: -0.9 });
    bots.wardens[1].pos.set(16.9, 0, 5.4);
    bots.wardens[1].setTask({ type: 'guard', x: 16.9, z: 5.4 });
    if (name === 'site') {
      stepSimUntil(30, () => match.bombPlanted);
      // The camera sits inside the warehouse's south-east corner: the planted
      // bomb at the site centre fills the frame while a retaker pushes in
      // through the south door toward it.
      bots.wardens[0].pos.set(-12.5, 0, -9.5);
      bots.wardens[0].setTask({ type: 'guard', x: siteCenter.x, z: siteCenter.z });
      stepSimUntil(1.4);
      body.position.set(-10.2, 0, -9.6); // inside, south-east corner of the warehouse
      body.velocity.set(0, 0, 0);
      aimAt(new THREE.Vector3(siteCenter.x, 0.9, siteCenter.z));
    } else {
      // Hold the remaining Wardens at their spawn so nobody interrupts the plant.
      bots.wardens[2].pos.set(-4, 0, 18);
      bots.wardens[2].setTask({ type: 'guard', x: -4, z: 18 });
      bots.wardens[3].pos.set(2, 0, 18);
      bots.wardens[3].setTask({ type: 'guard', x: 2, z: 18 });
      stepSimUntil(30, () => carrier.state === 'plant');
      stepSimUntil(0.7);
      body.position.set(-11.8, 0, -8.4); // at the south-door threshold, close on the carrier
      body.velocity.set(0, 0, 0);
      aimAt(new THREE.Vector3(carrier.pos.x, 1.0, carrier.pos.z));
    }
  } else if (name === 'clash') {
    stepSimUntil(BUY_TIME + 0.5);
    // A duel down the Long corridor: two against two in a straight lane, watched
    // from the side so the tracers cross the frame.
    const pose = (bot, x, z, yaw) => { bot.pos.set(x, 0, z); bot.yaw = yaw; bot.setTask({ type: 'hold', x, z }); };
    pose(bots.wardens[0], 16.5, 7, Math.PI);
    pose(bots.wardens[1], 18.5, 8.5, Math.PI);
    pose(bots.jackals[0], 16.5, -7, 0);
    pose(bots.jackals[1], 18.5, -8.5, 0);
    shotsFired = 0;
    stepSimUntil(3.2, () => shotsFired >= 9);
    body.position.set(16.5, 0, 11.5);
    body.velocity.set(0, 0, 0);
    aimAt(new THREE.Vector3(17.0, 1.0, -2.5));
  }
  hud.setVitals(proxy.hp, proxy.armor);
  hud.setAmmo(weapon.state(), weapon.current().name);
  syncCamera();
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

// Debug handle: lets a headless probe (and curious players) inspect the live sim.
window.__game = { bots, match, proxy, weapon, camera, scene, stepSim, world };

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (shot) runShot(shot);
else {
  syncCamera();
  requestAnimationFrame(frame);
}
