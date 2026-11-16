// The map: Foundry Yard, an original dusk freight depot built from boxes and barrels.
// Every solid is a collider the player and the bots resolve against, and a surface a
// bullet stops on. The yard has one bomb site (the warehouse, north-west), a container
// maze in the middle, a long east corridor, a short west connector, and a catwalk
// ("heaven") watching the site's east door. Spawns, the site, a waypoint graph and
// cover points are returned with the geometry so the match and the bots share one truth.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const WALL_H = 5;

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'lamp' || name === 'hazard' ? 0.4 : 0.92,
      metalness: name === 'steel' || name === 'rust' ? 0.25 : 0.03,
      emissive: name === 'lamp' ? new THREE.Color(PALETTE.lamp) : new THREE.Color('#000000'),
      emissiveIntensity: name === 'lamp' ? 1.6 : 0,
    });
  }

  const colliders = [];
  const shootables = [];

  function register(mesh, solid = true) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function box(width, height, depth, x, y, z, material, solid = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    return register(mesh, solid);
  }

  function barrel(x, z, material = 'rust') {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.05, 14), materials[material]);
    mesh.position.set(x, 0.53, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.42, 0, z - 0.42), new THREE.Vector3(x + 0.42, 1.05, z + 0.42)));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and the perimeter. The yard is 52 by 44 metres, walled, open to a dusk sky.
  box(52.8, 0.4, 44.8, 0, -0.2, 0, 'asphalt');
  box(52.8, WALL_H, 0.4, 0, WALL_H / 2, -22.2, 'concrete');
  box(52.8, WALL_H, 0.4, 0, WALL_H / 2, 22.2, 'concrete');
  box(0.4, WALL_H, 44.8, -26.2, WALL_H / 2, 0, 'concrete');
  box(0.4, WALL_H, 44.8, 26.2, WALL_H / 2, 0, 'concrete');

  // --- The warehouse (Site A), north-west: x -24..-8, z -20..-8 -------------------
  // South wall with a door gap at x -13..-10; east wall with a door gap at z -13..-10.
  box(16.4, WALL_H, 0.4, -16, WALL_H / 2, -20.2, 'steel');
  box(11, WALL_H, 0.4, -18.5, WALL_H / 2, -7.8, 'steel');
  box(2, WALL_H, 0.4, -9, WALL_H / 2, -7.8, 'steel');
  box(0.4, WALL_H, 5.4, -24.2, WALL_H / 2, -17.3, 'steel');
  box(0.4, WALL_H, 7.2, -24.2, WALL_H / 2, -10.4, 'steel');
  box(0.4, WALL_H, 7, -7.8, WALL_H / 2, -16.5, 'steel');
  box(0.4, WALL_H, 2.6, -7.8, WALL_H / 2, -9.3, 'steel');
  // A flat roof slab on beams leaves the interior in shadow but open at the top edges.
  box(16.4, 0.3, 12.4, -16, 4.4, -14, 'hairline');
  // Interior dressing: pallet stacks, a forklift-sized crate block, barrels.
  box(2.2, 1.15, 2.2, -20.5, 0.58, -16.5, 'timber');
  box(1.8, 1.15, 1.8, -20.3, 0.58, -11.5, 'timber');
  box(3.2, 2.2, 1.6, -12.5, 1.1, -17.8, 'steel');
  box(1.6, 0.75, 1.6, -10.2, 0.38, -14.6, 'timber');
  barrel(-18.6, -10.4);
  barrel(-17.8, -10.9, 'steel');
  barrel(-22.6, -18.6);
  // The plant zone: a hazard-painted square with four corner posts and a work lamp.
  const zone = box(9, 0.06, 9, -16, 0.03, -14, 'hazard', false);
  zone.material = materials.hazard;
  for (const [px, pz] of [[-20.3, -18.3], [-11.7, -18.3], [-20.3, -9.7], [-11.7, -9.7]]) {
    box(0.18, 1.5, 0.18, px, 0.75, pz, 'lamp');
  }

  // --- Mid: the container maze ------------------------------------------------------
  function container(x, z, material, level = 0, alongX = true) {
    const w = alongX ? 6.1 : 2.5;
    const d = alongX ? 2.5 : 6.1;
    return box(w, 2.6, d, x, 1.3 + level * 2.6, z, material);
  }
  container(-3, -4.5, 'rust');
  container(-3, -4.5, 'steel', 1);
  container(4.5, -5.5, 'steel', 0, false);
  container(-4.5, 7, 'rust', 0, false);
  container(-5.5, 4.5, 'steel');
  container(6.5, 4.0, 'rust');
  container(-1.5, -0.5, 'timber'); // a crate block in the crossroads
  box(1.7, 1.15, 1.7, -8.6, 0.58, 0.5, 'timber');
  box(1.7, 1.15, 1.7, 9.8, 0.58, -1.5, 'timber');
  barrel(2.8, 7.6);
  barrel(-7.2, -7.4, 'steel');

  // --- Heaven: a catwalk over the site's east door, steps up from mid ---------------
  box(4.6, 0.3, 5.6, -4.6, 2.75, -12.5, 'steel');
  box(0.25, 2.9, 5.6, -6.8, 1.45, -12.5, 'hairline');
  box(1.1, 0.55, 2.2, -1.6, 0.28, -12.5, 'concrete');
  box(1.1, 1.1, 2.2, -2.4, 0.55, -12.5, 'concrete');
  box(1.1, 1.65, 2.2, -3.2, 0.83, -12.5, 'concrete');
  box(1.1, 2.2, 2.2, -4.0, 1.1, -12.5, 'concrete');

  // --- Long: the east corridor -------------------------------------------------------
  box(0.4, 3.4, 20, 12.4, 1.7, -8, 'concrete');
  box(0.4, 3.4, 14, 12.4, 1.7, 15, 'concrete');
  container(19, -14, 'steel');
  container(19, -14, 'rust', 1);
  container(20, 2, 'rust', 0, false);
  // A parked flatbed truck across the corridor's south end.
  box(2.4, 1.5, 3.4, 18.5, 1.05, 9.5, 'rust');
  box(2.4, 0.35, 6.4, 18.5, 1.95, 13.6, 'steel');
  box(1.7, 1.15, 1.7, 15.2, 0.58, 6.4, 'timber');
  barrel(23.8, -6.5);
  barrel(23.1, -7.2, 'steel');

  // --- Short: the west connector ------------------------------------------------------
  box(7.5, 2.2, 0.4, -19.5, 1.1, 4.2, 'concrete');
  box(1.7, 1.15, 1.7, -14.8, 0.58, 10.8, 'timber');
  box(1.7, 1.15, 1.7, -22.3, 0.58, 10.5, 'timber');
  box(2.6, 0.75, 1.4, -12.8, 0.38, 12.2, 'timber');
  barrel(-23.5, 7.5);

  // Spawn dressing: low blocks so neither spawn is a bare corner.
  box(3.4, 1.15, 1.2, -3, 0.58, 19.5, 'timber');
  box(3.4, 1.15, 1.2, 4, 0.58, 19.5, 'timber');
  box(3.4, 1.15, 1.2, 0, 0.58, -19.6, 'timber');
  box(3.4, 1.15, 1.2, 7, 0.58, -19.6, 'timber');

  // Light: a low warm sun from the west, a cool sky fill, lamps at the site and mid.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8fa8c4'), new THREE.Color(PALETTE.canvas), 0.85);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb066'), 2.0);
  sun.position.set(-18, 16, 6);
  sun.target.position.set(2, 0, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5f7ea6'), 0.5);
  fill.position.set(10, 12, -14);
  scene.add(fill);
  for (const [lx, lz] of [[-16, -14], [0, 0]]) {
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.lamp), 60, 17, 1.8);
    lamp.position.set(lx, 3.6, lz);
    scene.add(lamp);
    box(0.16, 0.16, 0.16, lx, 3.7, lz, 'lamp', false);
  }

  // --- Shared truth: spawns, the site, waypoints, cover ------------------------------
  const sites = {
    A: { name: 'Site A', center: new THREE.Vector3(-16, 0, -14), radius: 4.6 },
  };
  const spawns = {
    defend: [
      new THREE.Vector3(-4, 0, 18.5), new THREE.Vector3(-1.5, 0, 19.2), new THREE.Vector3(1, 0, 18.5),
      new THREE.Vector3(3.5, 0, 19.2), new THREE.Vector3(6, 0, 18.5),
    ],
    attack: [
      new THREE.Vector3(-2, 0, -18.5), new THREE.Vector3(0.5, 0, -19.2), new THREE.Vector3(3, 0, -18.5),
      new THREE.Vector3(5.5, 0, -19.2), new THREE.Vector3(8, 0, -18.5),
    ],
  };

  // Waypoint graph: nodes bots walk between; edges are walked both ways.
  const W = (x, z) => new THREE.Vector3(x, 0, z);
  const waypoints = [
    { p: W(1, 17), links: [1, 2] }, // 0 defender spawn
    { p: W(-2, 8), links: [0, 5] }, // 1 mid south-west
    { p: W(8, 9), links: [0, 4] }, // 2 mid south-east
    { p: W(-9, 2), links: [5, 7, 10] }, // 3 short entry
    { p: W(14, 8), links: [2, 8, 23] }, // 4 long south
    { p: W(2.2, -0.5), links: [1, 3, 9, 23] }, // 5 mid crossroads
    { p: W(8.5, -6), links: [23] }, // 6 mid east lane
    { p: W(-16, 7), links: [3, 11] }, // 7 short mid
    { p: W(18, -3), links: [4, 12] }, // 8 long mid
    { p: W(-3, -9), links: [5, 14] }, // 9 heaven steps base
    { p: W(-11.5, 3), links: [3, 15] }, // 10 site south approach
    { p: W(-20, 12), links: [7, 16] }, // 11 short north
    { p: W(19, -12), links: [8, 22] }, // 12 long north
    { p: W(-4.6, -12.5), links: [], heaven: true }, // 13 heaven platform (player perch; bots never path here)
    { p: W(-9.5, -12), links: [9, 18] }, // 14 site east door, inside
    { p: W(-11.5, -6), links: [10, 19] }, // 15 site south door, outside
    { p: W(-13, 8), links: [11, 15] }, // 16 west lane
    { p: W(3, -17), links: [20, 22] }, // 17 attacker spawn east
    { p: W(-13, -11), links: [14, 19, 21] }, // 18 site interior east
    { p: W(-11.5, -9.5), links: [15, 18] }, // 19 site south door, inside
    { p: W(-4, -17), links: [17] }, // 20 attacker spawn west
    { p: W(-16, -14), links: [18], site: true }, // 21 site centre (plant zone)
    { p: W(16, -20), links: [17, 12] }, // 22 long north entrance, behind the wall
    { p: W(8.5, -0.5), links: [4, 5, 6] }, // 23 mid east, south of the tall container
  ];
  // Cover: spots a holding bot hugs, each with the direction it watches.
  const covers = [
    { p: W(-10.2, -15.8), face: W(-16, -14) },
    { p: W(-20.9, -12.2), face: W(-8, -8) },
    { p: W(-4.6, -12.5), face: W(-12, -12), heaven: true },
    { p: W(-7.9, -0.9), face: W(-2, -6) },
    { p: W(10.9, -2.2), face: W(4, -4) },
    { p: W(-14.9, 6.2), face: W(-10, 0) },
    { p: W(16.9, 5.4), face: W(18, -4) },
    { p: W(-12.1, 11.1), face: W(-6, 8) },
  ];

  return { colliders, shootables, group, sites, spawns, waypoints, covers };
}
