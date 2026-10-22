export const CLAN_DIVISIONS=Object.freeze(['BRONZE','SILVER','GOLD','PLATINUM','DIAMOND']);
export const CLAN_DIVISION_LABELS=Object.freeze({BRONZE:'Bronze',SILVER:'Silver',GOLD:'Gold',PLATINUM:'Platinum',DIAMOND:'Diamond'});
export const CLAN_DIVISION_REWARDS=Object.freeze({BRONZE:10000,SILVER:20000,GOLD:30000,PLATINUM:40000,DIAMOND:50000});
export const CLAN_SEASON_PARTICIPATION_REWARD=2000;
export const CLAN_DIVISION_ADVANCE_QUOTA=2;
export const CLAN_DIVISION_RELEGATION_QUOTA=2;
export const CLAN_SEASON_POINTS=Object.freeze({MATCH_WIN:100,MATCH_LOSS:25,DISTRICT_CAPTURE:50,DISTRICT_HOLD:10,INFLUENCE:0});
// These six task goals and CR awards are adjustable balance defaults from the
// current implementation brief, not locked game-economy decisions.
export const CLAN_TASK_CONFIG=Object.freeze({
  DAILY:Object.freeze([
    Object.freeze({id:'online_finishes',title:'Гоночная активность',description:'5 подтверждённых онлайн-финишей участников',eventType:'ONLINE_FINISH',target:5,reward:1000}),
    Object.freeze({id:'influence',title:'Влияние',description:'Заработать 100 влияния за день',eventType:'INFLUENCE',target:100,reward:1500}),
    Object.freeze({id:'treasury',title:'Казна',description:'Внести суммарно 5 000 CR',eventType:'CONTRIBUTION',target:5000,reward:500})
  ]),
  WEEKLY:Object.freeze([
    Object.freeze({id:'clan_matches',title:'Командные гонки',description:'Завершить 5 подтверждённых клановых матчей',eventType:'CLAN_MATCH',target:5,reward:5000}),
    Object.freeze({id:'district_captures',title:'Территориальная активность',description:'Совершить 2 успешных захвата районов',eventType:'DISTRICT_CAPTURE',target:2,reward:7500}),
    Object.freeze({id:'influence',title:'Развитие клана',description:'Заработать 500 подтверждённого влияния',eventType:'INFLUENCE',target:500,reward:5000})
  ])
});
