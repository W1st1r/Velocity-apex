import assert from 'node:assert/strict';
import {upgradeChanceBps,upgradeRefundCredits,publicConfig} from '../src/upgrade.mjs';
import {UPGRADE_CONFIG as C} from '../src/upgrade-config.mjs';

// Seeded xorshift32 is test-only. Production continues to use Web Crypto rejection sampling.
let seed=0x76a2c0de;
const rng=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/0x100000000;};
const modes={standard:C.returnBps,risk:C.riskReturnBps};
const scenarioRows=[];
for(const mode of ['standard','risk'])for(const protection of [false,true])for(const multiple of [1.25,2,5,10]){
 const rtp=modes[mode]/10000,refund=protection?C.protectionRefundBps/10000:0;
 const expectedChance=protection?(rtp-refund)/(multiple-refund):rtp/multiple;
 const bps=upgradeChanceBps(100000,Math.round(100000*multiple),protection,mode);
 const expectedPayout=expectedChance*multiple+(1-expectedChance)*refund;
 const meanProfit=expectedPayout-1;
 const variance=expectedChance*((multiple-1)-meanProfit)**2+(1-expectedChance)*(refund-1-meanProfit)**2;
 assert.ok(Math.abs(expectedPayout-rtp)<0.0002,`${mode} protected=${protection} x${multiple} RTP`);
 assert.ok(Math.abs(bps/10000-expectedChance)<0.0002);
 const trials=31250;let winCount=0;
 for(let i=0;i<trials;i++)if(rng()<bps/10000)winCount++;
 const observed=winCount/trials,standardError=Math.sqrt((bps/10000)*(1-bps/10000)/trials);
 assert.ok(Math.abs(observed-bps/10000)<4*standardError+0.0001,`${mode}/${protection}/x${multiple} 99.99% CI`);
 scenarioRows.push({mode,protection,multiple,chanceBps:bps,expectedRtpBps:Math.round(rtp*10000),observedWinRate:observed,meanProfitPct:meanProfit*100,variancePerStake2:variance,winRateCi99Lo:Math.max(0,observed-3.89*standardError),winRateCi99Hi:Math.min(1,observed+3.89*standardError)});
}
assert.equal(scenarioRows.length*31250,500000);

// Bankroll paths use cash-equivalent inventory value, fixed percentage staking, and 25 turns.
// 32 scenarios x 625 paths x 25 turns = 500,000 further seeded attempts.
const balances=[10000,100000,1000000,10000000],bankrollRows=[];
for(const mode of ['standard','risk'])for(const protection of [false,true])for(const multiple of [2,5])for(const initial of balances){
 const share=(mode==='risk'?C.riskMaxStakeShareBps:C.standardMaxStakeShareBps)/10000;
 const rtp=modes[mode]/10000,refund=protection?C.protectionRefundBps/10000:0;
 const chance=upgradeChanceBps(100000,Math.round(100000*multiple),protection,mode)/10000;
 const minimumLegalWager=20,ruinThreshold=minimumLegalWager/share;
 let ruined=0,belowHalf=0,upOneHalf=0,doubled=0,sumRatio=0;const terminal=[],maxDrawdowns=[],halfTimes=[];
 for(let path=0;path<625;path++){
   let bank=initial,peak=bank,maxDd=0;
   for(let turn=0;turn<25;turn++){
     if(bank<ruinThreshold)break;
     const wager=bank*share;
     if(rng()<chance)bank+=wager*(multiple-1);else bank-=wager*(1-refund);
     peak=Math.max(peak,bank);maxDd=Math.max(maxDd,1-bank/peak);if(bank<initial*.5&&!halfTimes.some(x=>x.path===path))halfTimes.push({path,turn:turn+1});
   }
   if(bank<ruinThreshold)ruined++;
   if(bank<initial*.5)belowHalf++;
   if(bank>=initial*1.5)upOneHalf++;
   if(bank>=initial*2)doubled++;
   sumRatio+=bank/initial;terminal.push(bank/initial);maxDrawdowns.push(maxDd);
 }
 terminal.sort((a,b)=>a-b);maxDrawdowns.sort((a,b)=>a-b);
 const n=terminal.length,quantile=(xs,q)=>xs[Math.min(n-1,Math.floor(q*(n-1)))];
 bankrollRows.push({mode,protection,multiple,initialCR:initial,stakeSharePct:share*100,horizonAttempts:25,ruinThresholdCR:ruinThreshold,probabilityNoLegalBet:ruined/n,probabilityBelowHalf:belowHalf/n,probabilityEverBelowHalf:halfTimes.length/n,medianAttemptsToHalf:halfTimes.length?halfTimes.map(x=>x.turn).sort((a,b)=>a-b)[Math.floor(halfTimes.length/2)]:null,probabilityAtLeast1_5x:upOneHalf/n,probabilityAtLeast2x:doubled/n,meanTerminalBankRatio:sumRatio/n,medianTerminalBankRatio:quantile(terminal,.5),p10TerminalBankRatio:quantile(terminal,.1),p90TerminalBankRatio:quantile(terminal,.9),medianMaxDrawdown:quantile(maxDrawdowns,.5),p90MaxDrawdown:quantile(maxDrawdowns,.9)});
}
assert.equal(bankrollRows.length*625*25,500000);
const streaks=[];
for(const mode of ['standard','risk'])for(const multiple of [1.25,2,5,10]){
 const p=modes[mode]/10000/multiple,q=1-p;
 streaks.push({mode,multiple,lossProbability: q,loss3:q**3,loss5:q**5,loss10:q**10,expectedWinsPer100:p*100});
}
const candidateRtp=[];
for(const mode of ['standard','risk'])for(const rtpBps of (mode==='standard'?[9200,9400,9600,9800]:[8800,9000,9200,9400]))for(const multiple of [1.25,2,5,10]){
 const rtp=rtpBps/10000,p=rtp/multiple,refund=C.protectionRefundBps/10000,protectedP=(rtp-refund)/(multiple-refund);
 const variance=p*(multiple-1-(rtp-1))**2+(1-p)*(0-(rtp-1))**2;
 candidateRtp.push({mode,rtpBps,multiple,winPct:+(p*100).toFixed(3),protectedWinPct:+(protectedP*100).toFixed(3),expectedLossPer100:+((1-rtp)*100).toFixed(2),variancePerStake2:+variance.toFixed(4),loss3:+((1-p)**3*100).toFixed(3),loss5:+((1-p)**5*100).toFixed(3),loss10:+((1-p)**10*100).toFixed(3)});
}
// 200,000 additional reproducible bankroll attempts compare fixed-fractional staking
// with a bounded martingale progression. All outcomes use the same declared odds.
const strategyRows=[];
for(const mode of ['standard','risk'])for(const initial of balances)for(const strategy of ['fixed_stake','fixed_fraction','bounded_martingale']){
 const share=(mode==='risk'?C.riskMaxStakeShareBps:C.standardMaxStakeShareBps)/10000,rtp=modes[mode]/10000,multiple=mode==='risk'?5:2;
 const chance=rtp/multiple,refund=0,threshold=20/share,paths=500;let ruined=0,belowHalf=0,upHalf=0,doubled=0,mean=0;const terminals=[];
 for(let path=0;path<paths;path++){
  let bank=initial,nextStake=0;
  for(let turn=0;turn<25;turn++){
   if(bank<threshold)break;
   const stake=strategy==='fixed_stake'?Math.min(100,bank*share):strategy==='fixed_fraction'?bank*share:Math.min(bank*share,Math.max(20,nextStake||bank*.01));
   if(rng()<chance){bank+=stake*(multiple-1);nextStake=0;}else{bank-=stake;nextStake=strategy==='bounded_martingale'?Math.min(bank*share,stake*2):0;}
  }
  if(bank<threshold)ruined++;if(bank<initial*.5)belowHalf++;if(bank>=initial*1.5)upHalf++;if(bank>=initial*2)doubled++;mean+=bank/initial;terminals.push(bank/initial);
 }
 terminals.sort((a,b)=>a-b);strategyRows.push({mode,initialCR:initial,strategy,paths,attemptsPerPath:25,stakeCapPct:share*100,winChancePct:chance*100,probabilityNoLegalBet:ruined/paths,probabilityBelowHalf:belowHalf/paths,probabilityAtLeast1_5x:upHalf/paths,probabilityAtLeast2x:doubled/paths,meanTerminalBankRatio:mean/paths,medianTerminalBankRatio:terminals[Math.floor(paths*.5)]});
}
assert.equal(strategyRows.length*500*25,300000);
const limits={standard:C.standardMaxStakeShareBps,risk:C.riskMaxStakeShareBps};
assert.deepEqual(publicConfig().modes.standard.maxStakeShareBps,1000);
assert.deepEqual(publicConfig().modes.risk.maxStakeShareBps,500);
console.log(JSON.stringify({seed:'0x76a2c0de',independentOddsAttempts:500000,bankrollAttempts:500000,strategyAttempts:300000,totalAttempts:1300000,scenarios:scenarioRows,bankroll:bankrollRows,strategies:strategyRows,streaks,candidateRtp,limits,protectedLosses:{refundPct:25,extraProtectionPremiumBps:0,standardRtpBps:C.returnBps,riskRtpBps:C.riskReturnBps}},null,2));
