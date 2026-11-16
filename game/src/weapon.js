// The armory: five original weapons as data, plus the player's hands — view models,
// magazines, reloads, switching, and the spread model that makes accuracy a choice:
// near-zero while still, wild while running, worse in the air. Bots read the same
// table, so a bot's rifle obeys the same numbers as the player's.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Handy', slot: 'sidearm', price: 0,
    damage: 34, headMult: 4, gap: 0.17, auto: false, pellets: 1,
    mag: 12, reserve: 100, reload: 1.4,
    spreadStill: 0.004, spreadMove: 0.03, falloffStart: 18, falloffMin: 0.55,
  },
  rush9: {
    id: 'rush9', name: 'Rush-9', slot: 'primary', price: 1100,
    damage: 26, headMult: 4, gap: 0.075, auto: true, pellets: 1,
    mag: 32, reserve: 128, reload: 1.8,
    spreadStill: 0.008, spreadMove: 0.045, falloffStart: 12, falloffMin: 0.4,
  },
  breacher: {
    id: 'breacher', name: 'SG-12 Breacher', slot: 'primary', price: 1800,
    damage: 12, headMult: 2, gap: 0.85, auto: false, pellets: 8,
    mag: 6, reserve: 36, reload: 2.6,
    spreadStill: 0.05, spreadMove: 0.07, falloffStart: 6, falloffMin: 0.25,
  },
  vantage: {
    id: 'vantage', name: 'AR-7 Vantage', slot: 'primary', price: 2700,
    damage: 40, headMult: 4, gap: 0.096, auto: true, pellets: 1,
    mag: 30, reserve: 90, reload: 1.9,
    spreadStill: 0.0022, spreadMove: 0.028, falloffStart: 24, falloffMin: 0.65,
  },
  longbow: {
    id: 'longbow', name: 'Longbow .338', slot: 'primary', price: 4750,
    damage: 110, headMult: 2, gap: 1.35, auto: false, pellets: 1,
    mag: 5, reserve: 30, reload: 2.8,
    spreadStill: 0.0006, spreadMove: 0.09, falloffStart: 999, falloffMin: 1,
  },
};

export const ARMOR_PRICE = 650;
export const KIT_PRICE = 400;

// Damage of one pellet at a distance, through armour. Headshots multiply first,
// then range falloff, then armour halves whatever is left (a helmet counts).
export function damageAt(def, distance, part, armored) {
  let damage = def.damage * (part === 'head' ? def.headMult : 1);
  if (distance > def.falloffStart) {
    const t = Math.min(1, (distance - def.falloffStart) / 30);
    damage *= 1 - t * (1 - def.falloffMin);
  }
  if (armored) damage *= 0.5;
  return damage;
}

// Spread in radians for a shooter moving at `speed` (m/s). Standing still on the
// ground is the only way to be truly accurate — the heart of the tactical loop.
export function spreadAt(def, speed, airborne) {
  const moveT = Math.min(1, speed / 5.2);
  let spread = def.spreadStill + moveT * def.spreadMove;
  if (airborne) spread += 0.06;
  return spread;
}

const MUZZLE_TIME = 0.06;

function buildViewModel(id, mats) {
  const model = new THREE.Group();
  const add = (w, h, d, x, y, z, mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    model.add(mesh);
    return mesh;
  };
  if (id === 'p9') {
    add(0.07, 0.09, 0.24, 0, 0, 0, mats.body);
    add(0.06, 0.12, 0.08, 0, -0.09, 0.07, mats.grip);
    add(0.03, 0.03, 0.1, 0, 0.05, -0.14, mats.grip);
  } else if (id === 'rush9') {
    add(0.08, 0.1, 0.4, 0, 0, 0, mats.body);
    add(0.05, 0.05, 0.22, 0, 0.02, -0.3, mats.grip);
    add(0.09, 0.16, 0.09, 0, -0.12, -0.02, mats.grip); // drum magazine
    add(0.07, 0.08, 0.18, 0, -0.03, 0.26, mats.grip);
  } else if (id === 'breacher') {
    add(0.09, 0.11, 0.52, 0, 0, 0, mats.body);
    add(0.07, 0.07, 0.34, 0, -0.01, -0.4, mats.grip);
    add(0.1, 0.09, 0.2, 0, -0.08, -0.28, mats.grip); // pump
    add(0.08, 0.09, 0.2, 0, -0.02, 0.33, mats.grip);
  } else if (id === 'longbow') {
    add(0.08, 0.1, 0.5, 0, 0, 0.05, mats.body);
    add(0.04, 0.04, 0.55, 0, 0.03, -0.5, mats.grip);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 10), mats.grip);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.1, -0.05);
    model.add(scope);
    add(0.07, 0.14, 0.07, 0, -0.11, 0.02, mats.grip);
    add(0.07, 0.08, 0.26, 0, -0.02, 0.36, mats.grip);
  } else {
    // vantage: the all-round rifle.
    add(0.09, 0.1, 0.42, 0, 0, 0, mats.body);
    add(0.045, 0.045, 0.4, 0, 0.025, -0.38, mats.grip);
    add(0.07, 0.16, 0.06, 0, -0.12, 0.03, mats.grip); // magazine
    add(0.05, 0.07, 0.05, 0, 0.09, -0.1, mats.grip); // rear sight block
    add(0.075, 0.08, 0.22, 0, -0.02, 0.3, mats.grip);
  }
  model.position.set(0.27, -0.27, -0.52);
  model.scale.setScalar(0.72);
  return model;
}

export function createWeapon(camera) {
  const mats = {
    grip: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 }),
    body: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.45, metalness: 0.4 }),
  };
  const models = {};
  for (const id of Object.keys(WEAPONS)) {
    models[id] = buildViewModel(id, mats);
    models[id].visible = false;
    camera.add(models[id]);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.19, -1.0);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  // Ownership and per-weapon ammunition. The player always owns the P9.
  const owned = { p9: true };
  const ammo = {};
  for (const id of Object.keys(WEAPONS)) ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  let currentId = 'p9';
  let hidden = false;
  let cooldown = 0;
  let reloadLeft = 0;
  let flashLeft = 0;
  let kick = 0;
  models[currentId].visible = true;

  function current() {
    return WEAPONS[currentId];
  }
  function state() {
    return { id: currentId, mag: ammo[currentId].mag, reserve: ammo[currentId].reserve, reloading: reloadLeft > 0 };
  }

  function step(dt) {
    cooldown = Math.max(0, cooldown - dt);
    flashLeft = Math.max(0, flashLeft - dt);
    kick += (0 - kick) * Math.min(1, dt * 14);
    const model = models[currentId];
    model.position.z = -0.52 + kick;
    model.rotation.x = kick * 2.2 + (reloadLeft > 0 ? -0.55 * Math.min(1, (current().reload - reloadLeft) * 2) : 0);
    flash.visible = flashLeft > 0 && !hidden;
    flash.rotation.z = flashLeft * 30;
    flashLight.intensity = flashLeft > 0 && !hidden ? 18 : 0;
    if (reloadLeft > 0) {
      reloadLeft = Math.max(0, reloadLeft - dt);
      if (reloadLeft === 0) {
        const slot = ammo[currentId];
        const take = Math.min(current().mag - slot.mag, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
      }
    }
  }

  return {
    state,
    current,
    step,
    owned: (id) => Boolean(owned[id]),
    ready() {
      return ammo[currentId].mag > 0 && cooldown === 0 && reloadLeft === 0;
    },
    canFire() {
      return cooldown === 0 && reloadLeft === 0;
    },
    pullTrigger() {
      cooldown = current().gap;
      flashLeft = MUZZLE_TIME;
      kick = current().id === 'longbow' || current().id === 'breacher' ? 0.11 : 0.055;
    },
    takeRound() {
      if (ammo[currentId].mag <= 0) return false;
      ammo[currentId].mag -= 1;
      return true;
    },
    reload() {
      const slot = ammo[currentId];
      if (reloadLeft > 0 || slot.mag === current().mag || slot.reserve === 0) return;
      reloadLeft = current().reload;
    },
    spread(speed, airborne) {
      return spreadAt(current(), speed, airborne);
    },
    give(id) {
      owned[id] = true;
      ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    },
    switchTo(id) {
      if (!owned[id] || id === currentId) return false;
      models[currentId].visible = false;
      currentId = id;
      models[currentId].visible = true;
      reloadLeft = 0;
      cooldown = Math.max(cooldown, 0.25);
      return true;
    },
    // Spectating hides the hands entirely — you are watching a teammate, not aiming.
    setVisible(v) {
      hidden = !v;
      for (const id of Object.keys(models)) models[id].visible = v && id === currentId;
      if (!v) flash.visible = false;
    },
    primaryId() {
      for (const id of Object.keys(WEAPONS)) if (owned[id] && WEAPONS[id].slot === 'primary') return id;
      return null;
    },
    // Round start: ammunition is free and full; a dead player's gear is gone.
    roundReset(lostGear) {
      if (lostGear) {
        for (const id of Object.keys(owned)) if (id !== 'p9') delete owned[id];
        if (WEAPONS[currentId].slot === 'primary') {
          models[currentId].visible = false;
          currentId = 'p9';
          models[currentId].visible = true;
        }
      }
      for (const id of Object.keys(WEAPONS)) ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      cooldown = 0;
      reloadLeft = 0;
      flashLeft = 0;
      kick = 0;
    },
  };
}
