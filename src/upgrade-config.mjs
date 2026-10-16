// Velocity Apex V69 · universal server-authoritative upgrade policy.
// Standard payout: mode-specific nominal RTP. Protected: 25% of stake refunded on loss; probability is adjusted for the same expected payout.
export const UPGRADE_CONFIG=Object.freeze({
  returnBps:9800,          // conservative STANDARD house edge; never depends on account or streak
  riskReturnBps:9400,      // higher RISK volatility/edge; identical RNG and target-value semantics
  minChanceBps:100,
  maxChanceBps:9900,
  chanceDivisor:1,
  protectionRefundBps:2500, // failed protected bet returns 25% of the assessed stake as CR
  standardMaxStakeShareBps:1000, // limit exposure to 10% of current CR + owned item value per attempt
  riskMaxStakeShareBps:500,      // RISK limit exposure to 5% per attempt
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
