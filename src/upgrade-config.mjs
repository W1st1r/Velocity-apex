// Velocity Apex V69 · universal server-authoritative upgrade policy.
// Standard payout: 96% before cap. Protected: 25% of stake refunded on loss; probability is adjusted for the same expected payout.
export const UPGRADE_CONFIG=Object.freeze({
  returnBps:9600,          // universal, never depends on account, level or streak
  minChanceBps:100,
  maxChanceBps:9500,
  chanceDivisor:1,
  protectionRefundBps:2500, // failed protected bet returns 25% of the full estimated stake as CR
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
