// The heads-up display: pure DOM over the canvas. Everything a tactical round
// needs at a glance — clock, score, money, health, magazine — plus the buy menu,
// the kill feed, round banners, and the bomb/defuse progress bar. Styled entirely
// from the shared palette via CSS custom properties in index.html.
const $ = (id) => document.getElementById(id);

export function createHud() {
  const els = {
    timer: $('hud-timer'),
    phase: $('hud-phase'),
    scoreW: $('score-w'),
    scoreJ: $('score-j'),
    round: $('hud-round'),
    money: $('hud-money'),
    hp: $('hud-hp'),
    armor: $('hud-armor'),
    ammo: $('hud-ammo'),
    weapon: $('hud-weapon'),
    feed: $('killfeed'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    buy: $('buymenu'),
    buyList: $('buymenu-list'),
    buyMoney: $('buymenu-money'),
    channel: $('channel'),
    channelFill: $('channel-fill'),
    channelLabel: $('channel-label'),
    hitmark: $('hitmarker'),
    vignette: $('vignette'),
    spectate: $('spectate'),
    hint: $('hint'),
    crosshair: $('crosshair'),
  };
  let bannerTimer = 0;
  let hitTimer = 0;
  let vignetteTimer = 0;

  function fmtTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    els,
    setClock(sec, phaseLabel, urgent = false) {
      els.timer.textContent = fmtTime(sec);
      els.timer.classList.toggle('urgent', urgent);
      els.phase.textContent = phaseLabel;
    },
    setScore(w, j, round, maxRounds) {
      els.scoreW.textContent = String(w);
      els.scoreJ.textContent = String(j);
      els.round.textContent = `ROUND ${round}/${maxRounds}`;
    },
    setMoney(m) { els.money.textContent = `$${m.toLocaleString('en-US')}`; },
    setVitals(hp, armor) {
      els.hp.textContent = `${Math.max(0, Math.ceil(hp))}`;
      els.hp.classList.toggle('low', hp <= 30);
      els.armor.textContent = armor ? '🛡' : '';
    },
    setAmmo(state, weaponName) {
      els.ammo.innerHTML = `${state.mag}<span class="reserve"> / ${state.reserve}</span>`;
      els.weapon.textContent = weaponName + (state.reloading ? ' — RELOADING' : '');
    },
    kill(text, cls = '') {
      const row = document.createElement('div');
      row.className = `feed-row ${cls}`;
      row.textContent = text;
      els.feed.appendChild(row);
      while (els.feed.children.length > 5) els.feed.removeChild(els.feed.firstChild);
      setTimeout(() => row.classList.add('fade'), 3600);
      setTimeout(() => row.remove(), 4300);
    },
    banner(title, sub = '', ms = 2400) {
      els.bannerTitle.textContent = title;
      els.bannerSub.textContent = sub;
      els.banner.classList.add('show');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => els.banner.classList.remove('show'), ms);
    },
    showBuy(items, money, onBuy) {
      els.buyMoney.textContent = `$${money.toLocaleString('en-US')}`;
      els.buyList.innerHTML = '';
      for (const item of items) {
        const btn = document.createElement('button');
        btn.className = 'buy-item';
        btn.disabled = item.disabled;
        btn.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span><span class="buy-price">${item.owned ? 'OWNED' : '$' + item.price}</span>`;
        btn.addEventListener('click', () => onBuy(item.id));
        els.buyList.appendChild(btn);
      }
      els.buy.classList.add('show');
    },
    hideBuy() { els.buy.classList.remove('show'); },
    channel(frac, label) {
      if (frac === null) { els.channel.classList.remove('show'); return; }
      els.channel.classList.add('show');
      els.channelFill.style.width = `${Math.round(frac * 100)}%`;
      els.channelLabel.textContent = label;
    },
    hitmark(headshot = false) {
      els.hitmark.classList.toggle('head', headshot);
      els.hitmark.classList.add('show');
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => els.hitmark.classList.remove('show'), 110);
    },
    damageFlash() {
      els.vignette.classList.add('show');
      clearTimeout(vignetteTimer);
      vignetteTimer = setTimeout(() => els.vignette.classList.remove('show'), 180);
    },
    spectate(name) {
      if (!name) { els.spectate.classList.remove('show'); return; }
      els.spectate.textContent = `SPECTATING — ${name}`;
      els.spectate.classList.add('show');
    },
    hint(text) {
      if (!text) { els.hint.classList.remove('show'); return; }
      els.hint.textContent = text;
      els.hint.classList.add('show');
    },
    setCrosshair(visible, spreadPx) {
      els.crosshair.style.opacity = visible ? '1' : '0';
      els.crosshair.style.setProperty('--gap', `${spreadPx}px`);
    },
  };
}
