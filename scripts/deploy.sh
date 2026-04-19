#!/usr/bin/env bash
# deploy.sh — compile and deploy the Smart Runtime to EVM and/or PVM
#
# Usage:
#   ./scripts/deploy.sh              # deploy both EVM and PVM to local node
#   ./scripts/deploy.sh evm          # deploy EVM only (local)
#   ./scripts/deploy.sh pvm          # deploy PVM only (local)
#   ./scripts/deploy.sh evm testnet  # deploy EVM to Polkadot Hub TestNet
#   ./scripts/deploy.sh pvm testnet  # deploy PVM to Polkadot Hub TestNet
#   ./scripts/deploy.sh both testnet # deploy both to TestNet

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/common.sh
source "$SCRIPT_DIR/common.sh"

TARGET="${1:-both}"   # evm | pvm | both
NETWORK="${2:-local}" # local | testnet

check_deps

# ---------------------------------------------------------------------------
# Helper: compile + deploy one side
# ---------------------------------------------------------------------------

deploy_evm() {
    info "=== EVM (solc) — network: $NETWORK ==="
    cd "$EVM_DIR"
    [ -d node_modules ] || npm ci
    npm run compile
    if [ "$NETWORK" = "testnet" ]; then
        npm run deploy:testnet
    else
        npm run deploy:local
    fi
    info "EVM deployment complete."
}

deploy_pvm() {
    info "=== PVM (resolc) — network: $NETWORK ==="
    cd "$PVM_DIR"
    [ -d node_modules ] || npm ci
    npm run compile
    if [ "$NETWORK" = "testnet" ]; then
        npm run deploy:testnet
    else
        # PVM requires a live node
        wait_for_rpc
        npm run deploy:local
    fi
    info "PVM deployment complete."
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

case "$TARGET" in
    evm)  deploy_evm ;;
    pvm)  deploy_pvm ;;
    both)
        deploy_evm
        deploy_pvm
        ;;
    *)
        error "Unknown target: $TARGET. Use: evm | pvm | both"
        exit 1
        ;;
esac

info "Done. Deployed addresses:"
cat "$DEPLOYMENTS_JSON"
