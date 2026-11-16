// Shared gunfire resolution for the player and all nine bots. The player's shots are
// true raycasts — against the yard's boxes and against three spheres per soldier —
// so cover genuinely protects and headshots are earned by aim. Bot shots at bots use
// the same raycast; bot shots at the player use an accuracy roll built from the same
// spread table (distance, target speed, the bot's own aim error), because a camera
// has no body to raycast. Either way the damage numbers come from one place.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { damageAt, spreadAt } from './weapon.js';

// Segment vs the world's boxes, in 3D (a collider's height band counts: you can
// shoot over a crate but not through a warehouse wall).
export function segmentBlocked(world, from, to) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  if (len < 1e-6) return false;
  dir.divideScalar(len);
  return rayHitWorld(world, from, dir, len - 0.05) !== null;
}

export function rayHitWorld(world, origin, dir, maxDist) {
  let best = null;
  for (const c of world.colliders) {
    const t = rayBox(origin, dir, c);
    if (t !== null && t > 0.01 && t < maxDist && (best === null || t < best.dist)) {
      best = { dist: t, point: origin.clone().addScaledVector(dir, t) };
    }
  }
  if (dir.y < -1e-6) {
    const t = -origin.y / dir.y;
    if (t > 0.01 && t < maxDist && (best === null || t < best.dist)) {
      best = { dist: t, point: origin.clone().addScaledVector(dir, t) };
    }
  }
  return best;
}

function rayBox(origin, dir, c) {
  let tmin = 0;
  let tmax = Infinity;
  const axes = [
    [origin.x, dir.x, c.min.x, c.max.x],
    [origin.y, dir.y, c.min.y, c.max.y],
    [origin.z, dir.z, c.min.z, c.max.z],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin > 0 ? tmin : (tmax > 0 ? tmax : null);
}

function raySphere(origin, dir, center, radius) {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const oz = origin.z - center.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0.01 ? t : null;
}

export function createCombat(scene, world, hooks) {
  // Tracer pool: one line per shot, fading fast.
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracers = [];
  for (let i = 0; i < 56; i += 1) {
    const geo = tracerGeo.clone();
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIdx = 0;
  // Impact flashes.
  const flashes = [];
  const flashGeo = new THREE.PlaneGeometry(0.3, 0.3);
  for (let i = 0; i < 28; i += 1) {
    const mesh = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    mesh.visible = false;
    scene.add(mesh);
    flashes.push({ mesh, life: 0 });
  }
  let flashIdx = 0;

  const lastShotAt = new Map();
  const clock = { now: 0 };

  function drawTracer(from, to, team) {
    const t = tracers[tracerIdx];
    tracerIdx = (tracerIdx + 1) % tracers.length;
    const pos = t.line.geometry.getAttribute('position');
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.material.color.set(team === 'warden' ? PALETTE.warden : PALETTE.jackal);
    t.line.material.opacity = 0.75;
    t.line.visible = true;
    t.life = 0.07;
  }
  function drawFlash(point, hitBody) {
    const f = flashes[flashIdx];
    flashIdx = (flashIdx + 1) % flashes.length;
    f.mesh.position.copy(point);
    f.mesh.material.color.set(hitBody ? PALETTE.ink : PALETTE.hazard);
    f.mesh.material.opacity = 0.9;
    f.mesh.scale.setScalar(hitBody ? 1.4 : 1);
    f.mesh.visible = true;
    f.life = 0.08;
  }

  function applyDamage(victim, amount, attacker, part, weaponId) {
    if (!victim.alive) return;
    victim.hp -= amount;
    if (victim.kind === 'bot') victim.onDamaged(attacker);
    hooks.onDamage?.(victim, amount, attacker, part);
    if (victim.hp <= 0) {
      victim.hp = 0;
      if (victim.kind === 'bot') victim.die();
      hooks.onKill?.(victim, attacker, weaponId, part === 'head');
    }
  }

  // One true-raycast shot. Used for the player's trigger and bot-vs-bot fire.
  function traceShot(shooter, origin, dir, def, targets) {
    lastShotAt.set(shooter, clock.now);
    hooks.onShot?.(shooter, def);
    const worldHit = rayHitWorld(world, origin, dir, 120);
    let bestDist = worldHit ? worldHit.dist : 120;
    let bestBot = null;
    let bestPart = 'body';
    for (const target of targets) {
      if (!target.alive || target === shooter || target.team === shooter.team) continue;
      for (const sphere of target.hitSpheres()) {
        const t = raySphere(origin, dir, sphere.c, sphere.r);
        if (t !== null && t < bestDist) {
          bestDist = t;
          bestBot = target;
          bestPart = sphere.part;
        }
      }
    }
    const end = origin.clone().addScaledVector(dir, bestDist);
    const muzzle = origin.clone().addScaledVector(dir, 0.4);
    drawTracer(muzzle, end, shooter.team);
    drawFlash(end, Boolean(bestBot));
    if (bestBot) {
      const damage = damageAt(def, bestDist, bestPart, bestBot.armor);
      applyDamage(bestBot, damage, shooter, bestPart, def.id);
      return { hit: bestBot, part: bestPart, damage };
    }
    return { hit: null };
  }

  // A bot's shot at the player: an accuracy roll from the same numbers that govern
  // the player's own spread, plus the bot's rolled aim error.
  function botShootAtPlayer(bot, player, def) {
    lastShotAt.set(bot, clock.now);
    hooks.onShot?.(bot, def);
    const from = bot.eyePos().add(new THREE.Vector3(0, -0.25, 0));
    const chest = player.chestPos();
    const dist = from.distanceTo(chest);
    const results = [];
    for (let pellet = 0; pellet < def.pellets; pellet += 1) {
      const sigma = bot.aimErr + spreadAt(def, 0, false) + def.spreadStill * 0.5;
      const devAngle = Math.abs((Math.random() + Math.random() + Math.random()) / 3 - 0.5) * 2 * sigma * 2.2;
      const missDist = Math.tan(devAngle) * dist;
      const speedPenalty = player.groundSpeed() * 0.05;
      const hit = missDist < 0.48 - speedPenalty && !segmentBlocked(world, from, chest);
      const end = chest.clone();
      end.x += (Math.random() - 0.5) * missDist * 2;
      end.y += (Math.random() - 0.5) * missDist;
      end.z += (Math.random() - 0.5) * missDist * 2;
      if (hit) {
        const part = Math.random() < 0.12 ? 'head' : 'body';
        const damage = damageAt(def, dist, part, player.armor);
        drawTracer(from, chest, bot.team);
        applyDamage(player, damage, bot, part, def.id);
        results.push({ hit: player, part, damage });
      } else {
        if (segmentBlocked(world, from, end)) {
          const wall = rayHitWorld(world, from, new THREE.Vector3().subVectors(end, from).normalize(), dist + 4);
          if (wall) end.copy(wall.point);
        }
        drawTracer(from, end, bot.team);
        drawFlash(end, false);
        results.push({ hit: null });
      }
    }
    return results;
  }

  // A bot's shot at another bot goes through the true raycast with aim error
  // applied to the direction — same cover, same spheres, same falloff.
  function botShootAtBot(bot, target, def) {
    const from = bot.eyePos().add(new THREE.Vector3(0, -0.25, 0));
    const aimPoint = target.chestPos();
    const dir = new THREE.Vector3().subVectors(aimPoint, from).normalize();
    const err = bot.aimErr + spreadAt(def, 0, false);
    dir.x += (Math.random() - 0.5) * 2 * err;
    dir.y += (Math.random() - 0.5) * 2 * err * 0.6;
    dir.z += (Math.random() - 0.5) * 2 * err;
    dir.normalize();
    const results = [];
    for (let pellet = 0; pellet < def.pellets; pellet += 1) {
      const pelletDir = dir.clone();
      if (def.pellets > 1) {
        pelletDir.x += (Math.random() - 0.5) * 2 * def.spreadStill;
        pelletDir.y += (Math.random() - 0.5) * 2 * def.spreadStill;
        pelletDir.z += (Math.random() - 0.5) * 2 * def.spreadStill;
        pelletDir.normalize();
      }
      results.push(traceShot(bot, from, pelletDir, def, [target]));
    }
    return results;
  }

  return {
    los: (from, to) => !segmentBlocked(world, from, to),
    noise: (actor) => clock.now - (lastShotAt.get(actor) ?? -99),
    traceShot,
    botShootAtPlayer,
    botShootAtBot,
    applyDamage,
    step(dt, now) {
      clock.now = now;
      for (const t of tracers) {
        if (t.life > 0) {
          t.life -= dt;
          t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.75;
          if (t.life <= 0) t.line.visible = false;
        }
      }
      for (const f of flashes) {
        if (f.life > 0) {
          f.life -= dt;
          f.mesh.material.opacity = Math.max(0, f.life / 0.08) * 0.9;
          if (f.life <= 0) f.mesh.visible = false;
        }
      }
    },
  };
}
