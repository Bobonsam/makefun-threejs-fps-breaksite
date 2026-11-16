// The nine soldiers who fill out both teams. Each bot is a small state machine —
// advance along the waypoint graph, hold a cover point, plant or defuse on task,
// and break off to fight when it sees or hears an enemy. Bots share the player's
// rules: the same weapon table, the same spread model (they stop to shoot straight,
// just like you), the same armour math. Their differences are human ones: reaction
// time, aim error, and burst discipline, rolled per bot so Vex is not Fenn.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS, spreadAt } from './weapon.js';

const WALK_SPEED = 3.3;
const PLANT_TIME = 3;
const DEFUSE_TIME = 10;
const DEFUSE_TIME_KIT = 5;

function resolveCircle(pos, radius, colliders) {
  for (const c of colliders) {
    // Skip anything the bot stands on (the ground slab tops out at y=0 — with a
    // tolerance, because Box3.setFromObject leaves float dust like 3e-9 on the top
    // face, and an exact comparison once let the ground eject every bot to the
    // map's edge) or walks beneath (roof slabs, stacked containers, the catwalk).
    if (pos.y >= c.max.y - 0.02 || pos.y + 1.7 <= c.min.y) continue;
    const nx = Math.max(c.min.x, Math.min(pos.x, c.max.x));
    const nz = Math.max(c.min.z, Math.min(pos.z, c.max.z));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      pos.x = nx + (dx / d) * radius;
      pos.z = nz + (dz / d) * radius;
    } else {
      const left = pos.x - c.min.x;
      const right = c.max.x - pos.x;
      const back = pos.z - c.min.z;
      const front = c.max.z - pos.z;
      const m = Math.min(left, right, back, front);
      if (m === left) pos.x = c.min.x - radius;
      else if (m === right) pos.x = c.max.x + radius;
      else if (m === back) pos.z = c.min.z - radius;
      else pos.z = c.max.z + radius;
    }
  }
  return pos;
}

function buildSoldier(team, name) {
  const group = new THREE.Group();
  const teamColor = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'warden' ? PALETTE.warden : PALETTE.jackal), roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.asphalt), roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.skin), roughness: 0.7 });
  const gunMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.5, metalness: 0.3 });
  const add = (parent, w, h, d, x, y, z, mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const legL = new THREE.Group();
  legL.position.set(-0.11, 0.82, 0);
  add(legL, 0.17, 0.8, 0.19, 0, -0.41, 0, dark);
  const legR = new THREE.Group();
  legR.position.set(0.11, 0.82, 0);
  add(legR, 0.17, 0.8, 0.19, 0, -0.41, 0, dark);
  group.add(legL, legR);
  add(group, 0.52, 0.62, 0.28, 0, 1.12, 0, teamColor); // torso
  add(group, 0.56, 0.4, 0.32, 0, 1.08, 0, dark); // vest
  const head = add(group, 0.3, 0.3, 0.3, 0, 1.62, 0, skin);
  add(group, 0.36, 0.13, 0.36, 0, 1.8, 0, teamColor); // helmet
  const gun = new THREE.Group();
  gun.position.set(0.18, 1.28, 0.18);
  add(gun, 0.07, 0.09, 0.52, 0, 0, 0.2, gunMat);
  add(gun, 0.05, 0.14, 0.05, 0, -0.1, 0.12, gunMat);
  group.add(gun);
  // Floating name tag so a screenshot reads as a team game, not mannequins.
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 56;
  const ctx2d = canvas.getContext('2d');
  ctx2d.font = '600 34px system-ui, sans-serif';
  ctx2d.textAlign = 'center';
  ctx2d.fillStyle = team === 'warden' ? PALETTE.warden : PALETTE.jackal;
  ctx2d.fillText(name, 128, 40);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }));
  sprite.scale.set(1.5, 0.33, 1);
  sprite.position.y = 2.18;
  group.add(sprite);
  return { group, legL, legR, gun, head };
}

// Breadth-first path over the waypoint graph, returned as ground points.
function findPath(world, fromX, fromZ, toX, toZ) {
  const nodes = world.waypoints;
  const nearest = (x, z) => {
    let best = 0;
    let bestD = Infinity;
    nodes.forEach((n, i) => {
      const d = (n.p.x - x) ** 2 + (n.p.z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };
  const start = nearest(fromX, fromZ);
  const goal = nearest(toX, toZ);
  if (start === goal) return [{ x: toX, z: toZ }];
  const prev = new Array(nodes.length).fill(-1);
  const queue = [start];
  prev[start] = start;
  while (queue.length) {
    const cur = queue.shift();
    if (cur === goal) break;
    for (const next of nodes[cur].links) {
      if (prev[next] === -1) { prev[next] = cur; queue.push(next); }
    }
  }
  if (prev[goal] === -1) return [{ x: toX, z: toZ }];
  const path = [];
  let cur = goal;
  while (cur !== start) { path.push({ x: nodes[cur].p.x, z: nodes[cur].p.z }); cur = prev[cur]; }
  path.reverse();
  path.push({ x: toX, z: toZ });
  return path;
}

class Bot {
  constructor(scene, world, team, name, rng) {
    this.kind = 'bot';
    this.team = team;
    this.name = name;
    this.world = world;
    const built = buildSoldier(team, name);
    this.group = built.group;
    this.legL = built.legL;
    this.legR = built.legR;
    this.gun = built.gun;
    scene.add(this.group);
    this.pos = this.group.position;
    this.yaw = 0;
    this.hp = 100;
    this.armor = false;
    this.hasKit = false;
    this.alive = true;
    this.weaponId = 'p9';
    this.mag = WEAPONS.p9.mag;
    this.cooldown = 0;
    this.burstLeft = 0;
    this.burstWaitUntil = 0;
    this.reloadUntil = 0;
    // Rolled temperament: nobody on the roster shares the exact same hands.
    this.reaction = 0.24 + rng() * 0.22;
    this.aimErr = 0.02 + rng() * 0.026;
    this.burstPause = 0.32 + rng() * 0.35;
    this.state = 'hold';
    this.task = { type: 'hold', x: 0, z: 0 };
    this.path = [];
    this.pathIdx = 0;
    this.target = null;
    this.lastSeen = null;
    this.lastSeenAt = -9;
    this.reactionAt = 0;
    this.scanAt = rng() * 0.15;
    this.channel = 0;
    this.walkPhase = rng() * 6;
    this.fallT = 0;
    this.speedNow = 0;
    this.hurtAt = -9;
    this.hurtBy = null;
  }

  eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.58, this.pos.z); }
  chestPos() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.12, this.pos.z); }
  headPos() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.62, this.pos.z); }
  hitSpheres() {
    return [
      { c: this.headPos(), r: 0.27, part: 'head' },
      { c: this.chestPos(), r: 0.43, part: 'body' },
      { c: new THREE.Vector3(this.pos.x, this.pos.y + 0.45, this.pos.z), r: 0.4, part: 'body' },
    ];
  }
  facing() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  setLoadout(weaponId, armor, hasKit) {
    this.weaponId = weaponId;
    this.mag = WEAPONS[weaponId].mag;
    this.armor = armor;
    this.hasKit = hasKit;
  }

  resetForRound(spawn, yaw = 0) {
    this.pos.set(spawn.x, 0, spawn.z);
    this.yaw = yaw;
    this.hp = 100;
    this.alive = true;
    this.group.rotation.set(0, this.yaw, 0);
    this.group.visible = true;
    this.target = null;
    this.lastSeen = null;
    this.channel = 0;
    this.cooldown = 0;
    this.burstLeft = 0;
    this.reloadUntil = 0;
    this.fallT = 0;
    this.state = 'advance';
    this.setTask(this.task);
  }

  setTask(task) {
    this.task = task;
    this.channel = 0;
    if (task.type === 'hold') {
      this.state = 'hold';
      this.path = [];
    } else {
      this.state = 'advance';
      this.path = findPath(this.world, this.pos.x, this.pos.z, task.x, task.z);
      this.pathIdx = 0;
    }
  }

  onDamaged(from) {
    this.hurtAt = performance.now() / 1000;
    this.hurtBy = from;
    if (this.state === 'plant' || this.state === 'defuse') {
      if (Math.random() < 0.45) { this.channel = 0; this.state = 'advance'; }
    }
    if (!this.target && from && from.alive) {
      // Turn toward the shooter even without line of sight — sound carries.
      const d = new THREE.Vector3().subVectors(from.chestPos(), this.chestPos());
      this.yaw = Math.atan2(d.x, d.z);
    }
  }

  die() {
    this.alive = false;
    this.state = 'dead';
    this.fallT = 0;
  }

  // ctx: { now, enemies, los(from,to), shoot(bot,target), noise(actor)->seconds since last shot,
  //        onPlanted(bot), onDefused(bot), bombPos }
  update(dt, ctx) {
    if (!this.alive) {
      if (this.fallT < 1) {
        this.fallT = Math.min(1, this.fallT + dt * 2.4);
        this.group.rotation.x = -Math.PI / 2 * this.fallT;
        this.pos.y = 0.1 * this.fallT;
      }
      return;
    }
    const now = ctx.now;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.speedNow = 0;

    // --- perception ------------------------------------------------------
    if (now >= this.scanAt) {
      this.scanAt = now + 0.14;
      let best = null;
      let bestD = Infinity;
      for (const enemy of ctx.enemies) {
        if (!enemy.alive) continue;
        const to = new THREE.Vector3().subVectors(enemy.chestPos(), this.eyePos());
        const dist = to.length();
        if (dist > 60 || dist >= bestD) continue;
        const facingDot = dist > 0.01 ? this.facing().dot(to.clone().normalize()) : 1;
        const heard = ctx.noise(enemy) < 1.2 && dist < 22;
        if (facingDot < 0.25 && dist > 5 && !heard) continue;
        if (!ctx.los(this.eyePos(), enemy.chestPos())) continue;
        best = enemy;
        bestD = dist;
      }
      if (best) {
        if (this.target !== best) this.reactionAt = now + this.reaction;
        this.target = best;
        this.lastSeen = best.chestPos();
        this.lastSeenAt = now;
      }
    }
    if (this.target && (!this.target.alive || now - this.lastSeenAt > 3)) {
      this.target = null;
      if (this.state === 'engage') this.state = 'advance';
      if (this.lastSeen && (this.task.type === 'goto' || this.task.type === 'guard')) {
        this.path = findPath(this.world, this.pos.x, this.pos.z, this.lastSeen.x, this.lastSeen.z);
        this.path.push({ x: this.task.x, z: this.task.z });
        this.pathIdx = 0;
      }
    }

    // --- combat ----------------------------------------------------------
    if (this.target && this.target.alive) {
      const targetPos = this.target.chestPos();
      const dist = this.eyePos().distanceTo(targetPos);
      const visible = ctx.los(this.eyePos(), targetPos);
      if (visible) this.lastSeenAt = now;
      const aim = new THREE.Vector3().subVectors(targetPos, this.chestPos());
      this.yaw = Math.atan2(aim.x, aim.z);
      this.gun.rotation.x = Math.atan2(aim.y, Math.hypot(aim.x, aim.z));
      if (visible && now >= this.reactionAt && this.state !== 'plant' && this.state !== 'defuse') {
        this.state = 'engage';
        const def = WEAPONS[this.weaponId];
        if (now < this.reloadUntil) {
          // reloading: hold position
        } else if (this.mag <= 0) {
          this.reloadUntil = now + def.reload * 1.15;
          this.mag = def.mag;
        } else if (this.cooldown === 0 && now >= this.burstWaitUntil) {
          ctx.shoot(this, this.target);
          this.mag -= 1;
          this.cooldown = def.gap;
          if (this.burstLeft <= 0) this.burstLeft = 3 + Math.floor(Math.random() * 3);
          this.burstLeft -= 1;
          if (this.burstLeft === 0) this.burstWaitUntil = now + this.burstPause + Math.random() * 0.3;
        }
        this.animate(dt, 0);
        return;
      }
      if (!visible && now - this.lastSeenAt > 0.8 && this.state === 'engage') {
        this.state = 'advance'; // lost them: push the last known spot
      }
    } else {
      this.gun.rotation.x = 0;
    }

    // --- tasks -------------------------------------------------------------
    if (this.state === 'plant') {
      this.channel += dt;
      this.animate(dt, 0);
      if (this.channel >= PLANT_TIME) { this.channel = 0; ctx.onPlanted(this); }
      return;
    }
    if (this.state === 'defuse') {
      this.channel += dt;
      this.animate(dt, 0);
      const need = this.hasKit ? DEFUSE_TIME_KIT : DEFUSE_TIME;
      if (this.channel >= need) { this.channel = 0; ctx.onDefused(this); }
      return;
    }
    if (this.state === 'advance') {
      const point = this.path[this.pathIdx];
      if (!point) { this.arrive(); this.animate(dt, 0); return; }
      const dx = point.x - this.pos.x;
      const dz = point.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.7) { this.pathIdx += 1; this.animate(dt, 0); return; }
      const stepLen = Math.min(dist, WALK_SPEED * dt);
      this.pos.x += (dx / dist) * stepLen;
      this.pos.z += (dz / dist) * stepLen;
      resolveCircle(this.pos, 0.42, this.world.colliders);
      this.speedNow = WALK_SPEED;
      const moveYaw = Math.atan2(dx, dz);
      let diff = moveYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, dt * 10);
      this.animate(dt, WALK_SPEED);
      return;
    }
    // hold: slow scan turn, weight on the site lane
    this.yaw += Math.sin(now * 0.4 + this.walkPhase) * dt * 0.25;
    this.animate(dt, 0);
  }

  arrive() {
    if (this.task.type === 'plant') this.state = 'plant';
    else if (this.task.type === 'defuse') this.state = 'defuse';
    else this.state = 'hold';
  }

  animate(dt, speed) {
    this.walkPhase += dt * (speed > 0 ? 7 : 0);
    const swing = speed > 0 ? Math.sin(this.walkPhase) * 0.55 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.group.rotation.y = this.yaw;
  }
}

export function createBots(scene, world, rng) {
  const wardens = ['Vex', 'Odo', 'Mira', 'Sana'].map((name) => new Bot(scene, world, 'warden', name, rng));
  const jackals = ['Rook', 'Fenn', 'Ilya', 'Petra', 'Ghost'].map((name) => new Bot(scene, world, 'jackal', name, rng));
  return { wardens, jackals, all: [...wardens, ...jackals] };
}
