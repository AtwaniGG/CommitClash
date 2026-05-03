#!/usr/bin/env bash
# Generate a fresh mainnet program keypair, wire it through declare_id! +
# Anchor.toml, and rebuild. After this, you can `anchor deploy --provider.cluster
# mainnet` and the program will live at the printed address.
#
# Run from repo root:
#   bash scripts/prep-mainnet.sh
#
# This DOES NOT touch the existing devnet program (different keypair file).
# Re-runnable: skips keypair generation if target/deploy/rps_onchain-mainnet-keypair.json
# already exists.

set -euo pipefail

cd "$(dirname "$0")/.."

KEYPAIR_PATH="target/deploy/rps_onchain-mainnet-keypair.json"
LIB_RS="programs/rps_onchain/src/lib.rs"
ANCHOR_TOML="Anchor.toml"

# 1. Generate the mainnet keypair if missing
if [ ! -f "$KEYPAIR_PATH" ]; then
  echo "→ Generating mainnet program keypair at $KEYPAIR_PATH"
  mkdir -p target/deploy
  solana-keygen new --outfile "$KEYPAIR_PATH" --no-bip39-passphrase --silent
else
  echo "✓ Mainnet keypair already exists at $KEYPAIR_PATH"
fi

NEW_PROGRAM_ID=$(solana-keygen pubkey "$KEYPAIR_PATH")
echo "→ Program ID: $NEW_PROGRAM_ID"

# 2. Update declare_id! in lib.rs
echo "→ Updating declare_id! in $LIB_RS"
sed -i.bak -E "s/declare_id!\(\"[A-Za-z0-9]+\"\);/declare_id!(\"$NEW_PROGRAM_ID\");/" "$LIB_RS"
rm -f "$LIB_RS.bak"

# 3. Update Anchor.toml — add/replace [programs.mainnet] section
echo "→ Updating Anchor.toml"
if grep -q "\[programs.mainnet\]" "$ANCHOR_TOML"; then
  # Replace existing line under [programs.mainnet]
  python3 -c "
import re, sys
p = '$ANCHOR_TOML'
s = open(p).read()
s = re.sub(r'(\[programs\.mainnet\]\n)rps_onchain\s*=\s*\"[^\"]+\"', r'\1rps_onchain = \"$NEW_PROGRAM_ID\"', s)
open(p, 'w').write(s)
"
else
  # Insert [programs.mainnet] after [programs.devnet] block
  python3 -c "
p = '$ANCHOR_TOML'
s = open(p).read()
new_block = '\n[programs.mainnet]\nrps_onchain = \"$NEW_PROGRAM_ID\"\n'
s = s.replace('[programs.localnet]', new_block + '\n[programs.localnet]', 1)
open(p, 'w').write(s)
"
fi

# 4. Rebuild
echo "→ Building program with new program ID..."
anchor build 2>&1 | tail -5

# 5. Sanity: show what the binary expects
EMBEDDED=$(strings "target/deploy/rps_onchain.so" 2>/dev/null | grep -E "^[A-HJ-NP-Za-km-z1-9]{32,44}$" | head -1 || true)

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  MAINNET PREP COMPLETE"
echo "════════════════════════════════════════════════════════════"
echo "Program keypair : $KEYPAIR_PATH"
echo "Program ID      : $NEW_PROGRAM_ID"
echo ""
echo "Next: deploy to mainnet (estimated cost: 3-5 SOL)"
echo "  solana config set --url https://api.mainnet-beta.solana.com"
echo "  anchor deploy --program-name rps_onchain --provider.cluster mainnet \\"
echo "    --program-keypair $KEYPAIR_PATH"
echo ""
echo "Then run scripts/mainnet-launch.ts with these env vars:"
echo "  PROGRAM_ID=$NEW_PROGRAM_ID"
echo "  RPS_MINT=<pump.fun mint>"
echo "  TREASURY_ATA=<your mainnet treasury ATA>"
echo "  SOL_TREASURY=<your SOL treasury wallet>"
echo "  SOL_BURN_WALLET=<your deployer wallet for buyback>"
