// The look plan, in one place. The first six values are the UI scheme (they are also the
// CSS custom properties in index.html); the rest dress the yard itself: dusk sky, concrete,
// rusted steel, crate timber, and the two team colours. Lighting makes the shades between.
export const PALETTE = {
  canvas: '#14161a',
  surface: '#1e2228',
  hairline: '#2c323a',
  ink: '#e9e6df',
  muted: '#98a0a8',
  accent: '#f0a830',
  sky: '#1b2735',
  concrete: '#6d7278',
  asphalt: '#3a3f45',
  rust: '#8a5a34',
  steel: '#4d6472',
  timber: '#977950',
  hazard: '#d8b13a',
  warden: '#7fb2e5',
  jackal: '#e58a4a',
  lamp: '#ffd9a0',
  skin: '#d9a066',
};

export function shade(name) {
  return PALETTE[name];
}
