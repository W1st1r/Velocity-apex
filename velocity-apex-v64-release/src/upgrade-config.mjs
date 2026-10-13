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

// V63 server-authoritative effect values mirror the client economy after the 1.40x effect rebalance.
export const UPGRADE_EFFECT_VALUES=Object.freeze({
  standard:{name:'STANDARD',price:0},
  blueFlame:{name:'BLUE TWIN FLAME',price:1875},
  cyanFlame:{name:'CYAN TWIN FLAME',price:3000},
  greenFlame:{name:'GREEN TWIN FLAME',price:3625},
  redFlame:{name:'RED TWIN FLAME',price:4375},
  purpleFlame:{name:'PURPLE TWIN FLAME',price:5625},
  orangeFlame:{name:'ORANGE TWIN FLAME',price:6625},
  rainbowFlame:{name:'RAINBOW / IRIDESCENT',price:9125}
});
