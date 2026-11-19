# GENESIS GARAGE

GENESIS GARAGE is a remixable time trial. A QR opens a car from the previous
player. Change the motor or tires, pick where to spend one boost, and compare
the result against that car on the same three-section course.

## Stage walkthrough

1. Open `garage.html`. Point to the wet turn, then offer one phone to a volunteer.
2. Have them replace the street tires with rain tires and start the run. Hold
   the boost for the gravel climb. The finish panel shows the gains and losses
   against the original car, section by section.
3. In a rehearsed Testnet session, save that run as V1. Open its QR on the
   second device, which loads V1 as the ghost. Swap a motor, race it, and save
   V2. Open V2's parent link to show the original build and submitting address.
4. Use a public, reachable page URL for the audience QR. A wallet-free link
   carries a versioned build code. A chain link carries a registry address and
   version ID. Test both on another network before the event.

Suggested stage introduction: “Scan this car. Swap one part and see if you
can beat it. On Monad the contract recalculates the lap and keeps the parent
version, so my run becomes your next challenge.”

## What the chain proves

`GenesisGarage.sol` pins the track, parts budget and integer time rules. A
record stores the parts, boost sector, simulated lap time, submitting address,
and parent version. Multiple records can reference the same parent. A version
ID is scoped to its registry address. The track animation runs in the browser.
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
that two test accounts can publish a parent, a remix, and an independent fork.
The Anvil test skips when its binary or the compiled artifact is unavailable.
The public Testnet wallet flow and physical phone behavior need a separate
rehearsal.
