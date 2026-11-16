// The match: rounds, phases, economy, the bomb, and both teams' orders. BREAKSITE
// is a first-to-7 over at most 12 rounds. Every round runs buy (12s, frozen) →
// live (100s) → planted (40s, if the Jackals get the bomb down) → end (3.5s).
// Money is the strategy layer: kills pay $300, a plant pays the planter $300,
// round wins pay $3,250, losses pay $1,400 plus a growing streak bonus — enough
// to force real eco decisions between the $2,700 Vantage and a saved pistol.
import * as THREE from 'three';
import { WEAPONS, ARMOR_PRICE, KIT_PRICE } from './weapon.js';
import { PALETTE } from './palette.js';

export const BUY_TIME = 12;
export const LIVE_TIME = 100;
export const BOMB_TIME = 40;
export const END_TIME = 3.5;
export const WIN_SCORE = 7;
export const MAX_ROUNDS = 12;
const START_MONEY = 800;
const KILL_REWARD = 300;
const PLANT_REWARD = 300;
const WIN_PAY = 3250;
const LOSS_BASE = 1400;

export function createMatch(deps) {
  const { world, bots, player, hud, sfx, combat, events, rng } = deps;
  const money = new Map();
  const allActors = [player, ...bots.all];
  for (const actor of allActors) money.set(actor, START_MONEY);

  let phase = 'buy';
  let phaseT = BUY_TIME;
  let round = 1;
  let scoreW = 0;
  let scoreJ = 0;
  let lossStreakW = 0;
  let lossStreakJ = 0;
  let bombPlanted = false;
  let bombPos = null;
  let carrier = null;
  let beepAt = 0;
  let defuseProgress = 0;
  let over = false;
  let winner = null;

  // The bomb prop: a dark charge with a light that blinks faster as it counts down.
  const bombMesh = new THREE.Group();
  const bombBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.18, 0.3),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.asphalt), roughness: 0.6 }),
  );
  bombBody.position.y = 0.09;
  const bombLight = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.05, 0.08),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.jackal) }),
  );
  bombLight.position.y = 0.2;
  bombMesh.add(bombBody, bombLight);
  bombMesh.visible = false;
  deps.scene.add(bombMesh);

  const site = world.sites.A;
  const sitePos = { x: site.center.x, z: site.center.z };
  // Cover points by role, indexed into world.covers (the heaven perch is the
  // player's alone — no waypoint path reaches it, so bots never get ordered there).
  const coverAt = (i) => ({ x: world.covers[i].p.x, z: world.covers[i].p.z });
  const SITE_COVERS = [0, 1];
  const MID_COVERS = [3, 4, 5, 7];
  const LONG_COVERS = [6];

  function teamAlive(team) {
    return allActors.filter((a) => a.team === team && a.alive);
  }

  function pay(actor, amount) {
    money.set(actor, Math.max(0, Math.min(16000, money.get(actor) + amount)));
  }

  function botBuy(bot) {
    let m = money.get(bot);
    const hasPrimary = WEAPONS[bot.weaponId]?.slot === 'primary';
    if (round === 1) {
      if (m >= ARMOR_PRICE && rng() < 0.55) { bot.armor = true; m -= ARMOR_PRICE; }
    } else {
      if (!hasPrimary && m >= WEAPONS.rush9.price) {
        const choices = ['vantage', 'vantage', 'breacher', 'rush9'].filter((id) => WEAPONS[id].price <= m);
        const pick = choices[Math.floor(rng() * choices.length)];
        bot.weaponId = pick;
        m -= WEAPONS[pick].price;
      }
      if (!bot.armor && m >= ARMOR_PRICE + 200) { bot.armor = true; m -= ARMOR_PRICE; }
      if (bot.team === 'warden' && !bot.hasKit && m >= KIT_PRICE + 300) { bot.hasKit = true; m -= KIT_PRICE; }
    }
    money.set(bot, m);
    bot.setLoadout(bot.weaponId, bot.armor, bot.hasKit);
  }

  function taskBots() {
    // Wardens: two hold the site, one watches mid, one watches Long.
    const wardenPosts = [SITE_COVERS[0], SITE_COVERS[1], MID_COVERS[0], LONG_COVERS[0]];
    bots.wardens.forEach((bot, i) => {
      const post = coverAt(wardenPosts[i % wardenPosts.length]);
      bot.setTask({ type: 'guard', x: post.x, z: post.z });
    });
    // Jackals: the carrier plants, two escort into the site, two apply pressure.
    carrier = bots.jackals[4];
    carrier.setTask({ type: 'plant', x: sitePos.x, z: sitePos.z });
    bots.jackals[0].setTask({ type: 'guard', ...coverAt(SITE_COVERS[0]) });
    bots.jackals[1].setTask({ type: 'guard', ...coverAt(SITE_COVERS[1]) });
    bots.jackals[2].setTask({ type: 'guard', ...coverAt(MID_COVERS[1]) });
    bots.jackals[3].setTask({ type: 'guard', ...coverAt(LONG_COVERS[0]) });
  }

  function retaskAfterPlant() {
    // Attackers fall back onto the site's cover points and hold.
    bots.jackals.forEach((bot, i) => {
      if (!bot.alive) return;
      const post = coverAt(SITE_COVERS[i % SITE_COVERS.length]);
      bot.setTask({ type: 'guard', x: post.x, z: post.z });
    });
    // Defenders: the nearest living Warden bot defuses (when the player is down);
    // the rest cover the site approaches.
    const aliveWardens = bots.wardens.filter((b) => b.alive);
    aliveWardens.sort((a, b) => a.pos.distanceTo(bombPos) - b.pos.distanceTo(bombPos));
    aliveWardens.forEach((bot, i) => {
      if (i === 0 && !player.alive) bot.setTask({ type: 'defuse', x: bombPos.x, z: bombPos.z });
      else {
        const post = coverAt(SITE_COVERS[(i + 1) % SITE_COVERS.length]);
        bot.setTask({ type: 'guard', x: post.x, z: post.z });
      }
    });
  }

  function startRound() {
    phase = 'buy';
    phaseT = BUY_TIME;
    bombPlanted = false;
    bombPos = null;
    defuseProgress = 0;
    bombMesh.visible = false;
    // Spawns: the player takes the first defend slot, bots fill the rest.
    // Bot yaw uses the bots' own facing convention: defenders face north (-Z),
    // attackers face south (+Z).
    player.alive = true;
    player.hp = 100;
    const wSpawns = world.spawns.defend;
    deps.placePlayer(wSpawns[0]);
    bots.wardens.forEach((bot, i) => {
      bot.weaponId = bot.roundWeapon ?? bot.weaponId;
      bot.resetForRound(wSpawns[(i + 1) % wSpawns.length], Math.PI);
    });
    const jSpawns = world.spawns.attack;
    bots.jackals.forEach((bot, i) => bot.resetForRound(jSpawns[i % jSpawns.length], 0));
    for (const bot of bots.all) botBuy(bot);
    taskBots();
    hud.setScore(scoreW, scoreJ, round, MAX_ROUNDS);
    hud.banner(`ROUND ${round}`, round === 1 ? 'Pistol round — $800 each. Hold Foundry Yard.' : '', 2200);
    events.onRoundStart?.(round);
  }

  function endRound(winnerTeam, reason) {
    if (phase === 'end' || over) return;
    phase = 'end';
    phaseT = END_TIME;
    const loserTeam = winnerTeam === 'warden' ? 'jackal' : 'warden';
    if (winnerTeam === 'warden') { scoreW += 1; lossStreakW = 0; lossStreakJ += 1; }
    else { scoreJ += 1; lossStreakJ = 0; lossStreakW += 1; }
    const loserStreak = winnerTeam === 'warden' ? lossStreakJ : lossStreakW;
    const lossPay = LOSS_BASE + Math.min(3, Math.max(0, loserStreak - 1)) * 500;
    for (const actor of allActors) {
      if (actor.team === winnerTeam) pay(actor, WIN_PAY);
      else pay(actor, lossPay);
    }
    hud.setScore(scoreW, scoreJ, round, MAX_ROUNDS);
    const playerWon = winnerTeam === 'warden';
    hud.banner(playerWon ? 'ROUND WON' : 'ROUND LOST', reason, 2800);
    if (playerWon) sfx.roundWin(); else sfx.roundLose();
    events.onRoundEnd?.(winnerTeam, reason);
    if (scoreW >= WIN_SCORE || scoreJ >= WIN_SCORE || round >= MAX_ROUNDS) {
      over = true;
      winner = scoreW === scoreJ ? null : (scoreW > scoreJ ? 'warden' : 'jackal');
    }
  }

  function plantBomb(bot) {
    if (bombPlanted || phase !== 'live') return;
    bombPlanted = true;
    bombPos = bot.pos.clone();
    bombMesh.position.copy(bombPos);
    bombMesh.visible = true;
    phase = 'planted';
    phaseT = BOMB_TIME;
    beepAt = 0;
    pay(bot, PLANT_REWARD);
    sfx.planted();
    hud.banner('BOMB PLANTED', 'Foundry Yard — Site A. Defuse it or clear the Jackals.', 2200);
    events.onPlant?.(bombPos);
    retaskAfterPlant();
  }

  function defuseBomb(by) {
    if (!bombPlanted) return;
    bombPlanted = false;
    bombMesh.visible = false;
    pay(by, KILL_REWARD);
    sfx.defused();
    endRound('warden', by.kind === 'player' ? 'You defused the bomb.' : `${by.name} defused the bomb.`);
  }

  function explodeBomb() {
    sfx.explode();
    bombMesh.visible = false;
    events.onExplode?.(bombPos);
    endRound('jackal', 'The bomb detonated at Site A.');
  }

  function checkElimination() {
    if (phase !== 'live' && phase !== 'planted') return;
    const wAlive = teamAlive('warden').length;
    const jAlive = teamAlive('jackal').length;
    if (!bombPlanted) {
      if (jAlive === 0) endRound('warden', 'Jackals eliminated.');
      else if (wAlive === 0) endRound('jackal', 'Wardens eliminated.');
    } else if (wAlive === 0) {
      phaseT = Math.min(phaseT, 3); // nobody left to defuse: hurry the inevitable
    }
  }

  function handleKill(victim, attacker, weaponId, headshot) {
    const weaponName = WEAPONS[weaponId]?.name || weaponId;
    hud.kill(`${attacker.name}  ⌐  ${weaponName}${headshot ? '  ⦿ HEADSHOT' : ''}  →  ${victim.name}`,
      victim.team === 'warden' ? 'feed-j' : 'feed-w');
    if (attacker && attacker !== victim && attacker.team !== victim.team) pay(attacker, KILL_REWARD);
    checkElimination();
  }

  function getBuyMenu() {
    const m = money.get(player);
    const items = [];
    for (const id of ['rush9', 'breacher', 'vantage', 'longbow']) {
      const def = WEAPONS[id];
      const owned = deps.playerOwns(id);
      items.push({
        id, key: items.length + 1, name: def.name, price: def.price,
        owned, disabled: owned || m < def.price,
      });
    }
    items.push({
      id: 'armor', key: 5, name: 'Kevlar Vest', price: ARMOR_PRICE,
      owned: player.armor, disabled: player.armor || m < ARMOR_PRICE,
    });
    items.push({
      id: 'kit', key: 6, name: 'Defuse Kit', price: KIT_PRICE,
      owned: player.hasKit, disabled: player.hasKit || m < KIT_PRICE,
    });
    return items;
  }

  function playerBuy(id) {
    if (phase !== 'buy') return false;
    const m = money.get(player);
    if (id === 'armor') {
      if (player.armor || m < ARMOR_PRICE) { sfx.denied(); return false; }
      money.set(player, m - ARMOR_PRICE);
      player.armor = true;
      sfx.buy();
      return true;
    }
    if (id === 'kit') {
      if (player.hasKit || m < KIT_PRICE) { sfx.denied(); return false; }
      money.set(player, m - KIT_PRICE);
      player.hasKit = true;
      sfx.buy();
      return true;
    }
    const def = WEAPONS[id];
    if (!def || deps.playerOwns(id) || m < def.price) { sfx.denied(); return false; }
    money.set(player, m - def.price);
    deps.playerGive(id);
    sfx.buy();
    return true;
  }

  function update(dt, input, now) {
    phaseT -= dt;
    // Phase clocks.
    if (phase === 'buy' && phaseT <= 0) {
      phase = 'live';
      phaseT = LIVE_TIME;
      hud.hideBuy();
      events.onLive?.();
    } else if (phase === 'live' && phaseT <= 0) {
      if (!bombPlanted) endRound('warden', 'Time. The Yard holds.');
    } else if (phase === 'planted') {
      // The bomb's own clock: beeps accelerate as it runs down.
      beepAt -= dt;
      if (beepAt <= 0) {
        sfx.beep(phaseT <= 5);
        beepAt = phaseT > 10 ? 1 : phaseT > 5 ? 0.5 : 0.25;
        bombLight.material.color.set(phaseT <= 5 ? PALETTE.accent : PALETTE.jackal);
      }
      bombLight.visible = (now * (phaseT > 10 ? 1 : phaseT > 5 ? 2 : 4)) % 1 < 0.5;
      if (phaseT <= 0) explodeBomb();
    } else if (phase === 'end' && phaseT <= 0) {
      if (over) {
        phase = 'over';
        const playerWon = winner === 'warden';
        hud.banner(winner === null ? 'DRAW' : playerWon ? 'MATCH WON' : 'MATCH LOST',
          `Final score — Wardens ${scoreW} : ${scoreJ} Jackals`, 6000);
        sfx.matchEnd(playerWon);
        events.onMatchEnd?.(winner, scoreW, scoreJ);
      } else {
        round += 1;
        // Gear carries over only for survivors; the dead re-buy from pistols.
        for (const bot of bots.all) bot.roundWeapon = bot.alive ? bot.weaponId : 'p9';
        if (!player.alive) deps.playerLostGear();
        startRound();
      }
    }

    // The player's own defuse channel.
    if (phase === 'planted' && player.alive && bombPos) {
      const near = player.pos.distanceTo(bombPos) < 2.3;
      if (near && input.defuseHeld) {
        const need = player.hasKit ? 5 : 10;
        defuseProgress += dt;
        hud.channel(defuseProgress / need, player.hasKit ? 'DEFUSING (KIT)' : 'DEFUSING');
        if (defuseProgress >= need) { hud.channel(null); defuseBomb(player); }
      } else {
        defuseProgress = 0;
        hud.channel(near ? 0 : null, near ? 'HOLD E TO DEFUSE' : '');
        if (!near) hud.channel(null);
      }
    } else if (phase !== 'planted') {
      hud.channel(null);
    }

    // Bots think and fight — but the buy phase is frozen, per the rules.
    if (phase === 'live' || phase === 'planted') {
      for (const bot of bots.all) {
        const enemies = bot.team === 'warden'
          ? [player.team === 'jackal' ? player : null, ...bots.jackals].filter(Boolean)
          : [player, ...bots.wardens];
        bot.update(dt, {
          now,
          enemies: enemies.filter((e) => e.alive),
          los: combat.los,
          noise: combat.noise,
          shoot: (shooter, target) => {
            const def = WEAPONS[shooter.weaponId];
            if (target.kind === 'player') combat.botShootAtPlayer(shooter, player, def);
            else combat.botShootAtBot(shooter, target, def);
          },
          onPlanted: (b) => plantBomb(b),
          onDefused: (b) => defuseBomb(b),
          bombPos,
        });
      }
      checkElimination();
    } else {
      for (const bot of bots.all) if (!bot.alive) bot.update(dt, { now, enemies: [], los: combat.los, noise: () => 99, shoot: () => {}, onPlanted: () => {}, onDefused: () => {}, bombPos: null });
    }

    // HUD clock.
    const labels = { buy: 'BUY PHASE', live: 'HOLD THE YARD', planted: 'BOMB PLANTED', end: 'ROUND OVER', over: 'MATCH OVER' };
    hud.setClock(Math.max(0, phaseT), labels[phase], (phase === 'live' && phaseT < 10) || phase === 'planted');
    hud.setMoney(money.get(player));
    return { phase, phaseT };
  }

  return {
    start: startRound,
    update,
    handleKill,
    getBuyMenu,
    playerBuy,
    playerMoney: () => money.get(player),
    get phase() { return phase; },
    get over() { return over; },
    get bombPlanted() { return bombPlanted; },
    get bombPos() { return bombPos; },
    get round() { return round; },
    get scores() { return { w: scoreW, j: scoreJ }; },
  };
}
