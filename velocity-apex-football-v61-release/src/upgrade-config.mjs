// Velocity Apex · Garage Upgrade economy (V59)
// Change these values centrally; the server remains authoritative.
export const UPGRADE_CONFIG=Object.freeze({
  returnBps:7360,       // 73.60% expected-value factor (20% lower than V57)
  minChanceBps:100,     // V58 eligibility threshold; existing valid stakes remain valid
  maxChanceBps:7200,    // V58 cap before reducing the result
  chanceDivisor:6,      // actual server success chance is six times smaller than the pre-V59 calculation
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
