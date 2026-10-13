# Garage navigation V56

The prior V55 archive did not account for mobile-ui.css, which loads after style.css and applies important declarations to every catalog panel. On iPad/iPhone landscape, this placed the Garage tab strip in a shrinking grid track and turned the seven category buttons into a flex strip where the first button kept a 100% width.

V56 gives Garage its own explicit row layout for Cars, Effects, and Upgrade in both stylesheets. The three primary tabs have a reserved row, and all seven car categories share one row. Hidden panes no longer shift the active content. The stationary wheel and rotating pointer from V55 are retained. Asset cache keys include V56.

Deployment instructions: DEPLOY_V56.txt.
