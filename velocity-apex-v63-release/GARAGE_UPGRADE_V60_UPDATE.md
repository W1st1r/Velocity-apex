# Garage Upgrade V60

V60 changes only the client-side presentation of Garage → Upgrade odds. The authoritative server probability remains identical to V59 (`chanceDivisor: 6`).

The wheel, center percentage, success/failure text, confirmation dialog and history now display 4.5× the authoritative chance. Examples: real 5.00% → visual 22.50%; real 9.20% → visual 41.40%; real 12.00% → visual 54.00%.

The server still determines success before animation using the unchanged real chance. The pointer landing is remapped only visually so server SUCCESS ends inside the enlarged green sector and server FAILED ends inside the red sector. Stake prices, item/credit deductions, duplicate-attempt protection and upgrade rewards are unchanged.

Automated regression coverage checks the unchanged server chance, the 4.5× presentation multiplier and all 10,000 possible pointer positions for representative chances.

No database migration is required.
