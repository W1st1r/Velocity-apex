# Velocity Apex 2.0 menu and screen map

This map records the screen entry points and return routes found in `public/index.html` and the client modules. Layered panels inside Free Roam are not separate page routes.

| From | Open | Return / failure route | Owner |
|---|---|---|---|
| Auth gate | Main menu (guest or signed in) | Auth forms stay in the gate; successful auth enters the game | `account.js` |
| Main menu | Local modes → setup or career → countdown/race → result | Setup/career back to mode select; result to menu/career or retry | `game.js` |
| Main menu / setup | Garage, shop → personal shop or market | Catalog back target is preserved as menu or setup | `game.js`, `garage.js`, `market.js` |
| Main menu | Account, recovery, friends, promo, referrals, top-up | Each overlay's close/back returns to its caller/menu | `account.js`, `friends.js`, `promo.js`, `referrals.js`, `payments.js` |
| Main menu | Online → rooms or free city | Online back to menu; free city server list back to online hub | `online.js`, `freeroam.js` |
| Online hub | Create/join → lobby → online race/results | Lobby leave/results return to hub or menu | `online.js`, `game.js` |
| Free city | Chat, pause, map, levels, minigames, drag wager, venue garage | Close each panel to free city; leave returns to main menu | `freeroam.js` |
| Settings | Controls, admin auth/console, support/staff panels | Back returns to settings/menu; auth denial returns safely | `game.js`, `root-console.js`, `admin-system.js` |
| Career / race | Level list, race, finish | Level back to mode select; finish returns to career or main menu | `game.js` |

`runtimeFailure` is the shared recovery surface for exceptions in the two continuously rendered game canvases. Retry resumes the same local state; Back uses the existing game/free-roam exit path. HTTP and action failures remain in their owning screen with an inline message and retry affordance. The free-city server list ignores stale refresh responses and allows only one join request at a time.

Known limitation: this is a source-level route inventory; visual traversal on physical iPhone Safari/PWA remains a manual QA requirement.
