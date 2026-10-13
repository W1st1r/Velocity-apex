// Velocity Apex V65 · public, server-authoritative upgrade payout policy.
// Chance = min(85%, stakeValue / targetValue * stage RTP). No personalized streak penalties.
export const UPGRADE_CONFIG=Object.freeze({
  returnBps:9000,       // standard expected value at eligible sub-cap stake ratios
  minChanceBps:100,     // minimum eligible pre-cap chance basis points
  maxChanceBps:8500,    // no attempt is ever 100% guaranteed
  chanceDivisor:1,
  introReturnBps:9800,  // first 5 completed attempts, including previous V64 history
  midReturnBps:9400,    // completed attempts 5 through 19
  level30ReturnBps:9100,
  level60ReturnBps:9200,
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
