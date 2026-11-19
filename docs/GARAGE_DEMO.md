# GENESIS GARAGE

GENESIS GARAGE is a live champion challenge. The screen gives the room one
instruction: **scan the champion, change one part, beat it.** A phone opens the
exact champion car, and the player chooses a motor or tires plus one boost on a
fixed three-section course.

## Stage walkthrough

1. Put `garage.html?wall=1` on the projector. The screen shows the champion,
   recent challenge tree, and entry QR. Have a volunteer scan it.
2. Have them replace the street tires with rain tires and start the run. Hold
   the boost for the gravel climb. The finish panel shows the gains and losses
   against the original car, section by section.
3. In a rehearsed Testnet session, submit the winning car. The contract makes
   it the new champion. Open its QR on the second phone, change another part,
   and challenge it. Show the numbered cars only after the audience understands
   the race: each number is one saved car, and its parent is the car it modified.
4. Use a public, reachable page URL for the audience QR. A wallet-free link
   carries a versioned build code. A chain link carries a registry address and
   version ID. Test both on another network before the event.

Suggested stage introduction: “This is the car to beat. Scan it, change one
part, and race it. If you are faster, Monad makes your car the new champion and
the next person challenges you.”

## What the chain proves

`GenesisGarage.sol` pins the track, parts budget and integer time rules. A
record stores the parts, boost sector, simulated lap time, submitting address,
and parent car. Only a faster child of the current champion can take the crown;
simultaneous stale challenges remain branches and cannot overwrite it. A car ID
is scoped to its registry address. The track animation runs in the browser.
Any participant can reproduce the score from public inputs or precompute a
build; a recorded score does not prove that a human operated the game.

The practice app has no wallet dependency. To configure the optional Testnet
path, create the contract with Foundry using a dedicated test-only keystore.
This sends a Testnet transaction and uses test MON for gas:

```powershell
forge build --root contracts --use 0.8.29
py -3.12 tools/export_garage.py
forge create --root contracts --use 0.8.29 GenesisGarage.sol:GenesisGarage --rpc-url https://testnet-rpc.monad.xyz --account genesis-testnet --broadcast
```

Once the deployment is finalized, open the deployed address under **Monad
Testnet** in the Garage. Enter version `0` to load the stock car. Wallet
signing is required only to publish a completed run. The confirmation counter
starts when the wallet returns a transaction hash and ends when this client
verifies the finalized version. To test the relay on stage, separately time
how long it takes the second phone to load the version from its QR.

## Checks

```powershell
forge build --root contracts --use 0.8.29
node --test frontend/garage/verify.mjs frontend/community/verify.mjs frontend/sandbox/verify.mjs frontend/studio/verify.mjs
forge test --root contracts --use 0.8.29
```

The Garage's Node suite checks all 32 legal part and boost combinations,
compares the JavaScript and Solidity results on loopback Anvil, and verifies
that two test accounts can promote consecutive champions while an independent
stale fork is recorded without replacing the champion.
The Anvil test skips when its binary or the compiled artifact is unavailable.
The public Testnet wallet flow and physical phone behavior need a separate
rehearsal.

## Executed validation · 2026-11-19

- `pytest -q`: 638 passed.
- strict mypy: 27 source files clean.
- all frontend Node suites: 29 passed, including the Anvil two-account flow.
- `forge test`: 15 passed, including champion promotion, losing branches, and
  stale-fork protection.
- Browser rehearsal: desktop projector view and a 390 × 844 phone viewport;
  part swap, race, boost, winning result, and handoff QR completed with no
  captured console warnings or errors.

No public Monad Testnet deployment or physical iPhone rehearsal was executed in
this validation. The wall's Testnet history therefore remains a tested local
implementation, not a claim of production network readiness.
