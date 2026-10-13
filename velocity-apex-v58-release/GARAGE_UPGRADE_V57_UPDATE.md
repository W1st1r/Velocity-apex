# Garage Upgrade V57

The confirmation dialog shown after choosing an Upgrade target appeared against the left screen edge in iPad Safari. The browser's intrinsic dialog positioning was not reliable with the original auto width. The confirmation and history dialogs now cover the visual viewport in the native top layer and center scrollable cards inside safe-area padding. Clicking the empty backdrop dismisses either dialog. Summary and action text sizes remain legible on short screens. V56 Garage navigation and V55 pointer animation are retained. No database migration is required.

Deployment: DEPLOY_V57.txt.
