-- Refresh district presentation metadata on databases that already ran 0026.
-- Preserve ownership, capture/protection timestamps, influence and income cursors.
UPDATE clan_war_districts SET name='Panoramic Ridge',map_x=650,map_y=720 WHERE id='north-loop';
UPDATE clan_war_districts SET name='Harbor Drift',map_x=700,map_y=2250 WHERE id='harbor-crossing';
UPDATE clan_war_districts SET name='Central Park',map_x=1370,map_y=1300 WHERE id='old-town';
UPDATE clan_war_districts SET name='Industrial Park',map_x=3900,map_y=1200 WHERE id='south-industrial';
UPDATE clan_war_districts SET name='Solar Quarter',map_x=3850,map_y=1900 WHERE id='apex-heights';
UPDATE clan_war_districts SET name='Apex Bay Coast',map_x=1680,map_y=2300 WHERE id='coastal-ridge';
UPDATE clan_war_districts SET name='Downtown · Motor Club',map_x=2320,map_y=1500 WHERE id='grand-avenue';
UPDATE clan_war_districts SET name='Airport District',map_x=3900,map_y=2620 WHERE id='apex-center';
