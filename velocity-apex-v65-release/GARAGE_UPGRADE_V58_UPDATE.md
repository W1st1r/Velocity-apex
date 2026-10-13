# Garage Upgrade V58

Upgrade success now occurs less frequently: the server chance factor changed from 92% to 73.6% (a 20% relative reduction), and the maximum chance changed from 90% to 72%. The server still determines the outcome before the arrow animates. The arrow uses the returned random ticket, so it stops in the green sector only for a win. The wheel and menu keep their layout and animation. The displayed chance and green sector reflect the actual server chance.

The minimum accepted chance remains 1%. Previously valid stakes near that threshold may now need a larger stake. This update requires no database migration.

Deployment: DEPLOY_V58.txt.
