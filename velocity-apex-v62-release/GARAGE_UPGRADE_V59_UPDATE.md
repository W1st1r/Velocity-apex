# Garage Upgrade V59

The server calculates the V58 chance and then divides it by six, rounding down to whole basis points. For example, a former 30.00% chance is now 5.00%. The existing minimum stake eligibility check still uses the V58 chance, so the same stakes remain valid; the minimum displayed and actual chance can be 0.16%.

The quote, wheel segment, percentage label, confirmation, completed attempt and history all use the lower actual chance. The server samples an independent random ticket from 0 to 9999 before animation; the unchanged pointer animation stops in the green segment exactly for a successful ticket. Prices, inventory deductions, duplicate request handling and other modes remain unchanged.

Automated verification enumerates all 10,000 possible tickets for the 5.00% example, yielding exactly 500 wins and 9,500 losses. The regression suite also checks chance examples, eligibility threshold code and pointer wiring.

Deployment instructions: `DEPLOY_V59.txt`. No database migration is needed.
