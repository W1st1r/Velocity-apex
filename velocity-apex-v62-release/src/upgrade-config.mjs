// Velocity Apex · Garage Upgrade economy (V62)
// The server is authoritative. At ~98% stake/target value the real chance reaches ~50%.
export const UPGRADE_CONFIG=Object.freeze({
  returnBps:5100,       // real chance slope: stake/target × 51%
  minChanceBps:100,     // minimum eligible pre-cap chance basis points
  maxChanceBps:5000,    // hard real success cap: 50%
  chanceDivisor:1,      // V62 no longer applies the old hidden 6x reduction
  maxStakeItems:12,
  maxCredits:999999999
});

// Client effect prices are increased by the project's V13 economy multiplier (1.25x).
export const UPGRADE_EFFECT_VALUES=Object.freeze({
  standard:{name:'STANDARD',price:0},
  blueFlame:{name:'BLUE TWIN FLAME',price:1375},
  cyanFlame:{name:'CYAN TWIN FLAME',price:2125},
  greenFlame:{name:'GREEN TWIN FLAME',price:2625},
  redFlame:{name:'RED TWIN FLAME',price:3125},
  purpleFlame:{name:'PURPLE TWIN FLAME',price:4000},
  orangeFlame:{name:'ORANGE TWIN FLAME',price:4750},
  rainbowFlame:{name:'RAINBOW / IRIDESCENT',price:6500}
});
