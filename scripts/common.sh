#!/usr/bin/env bash
# common.sh — shared variables and helpers for Smart Runtime scripts

set -euo pipefail

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVM_DIR="$REPO_ROOT/contracts/evm"
PVM_DIR="$REPO_ROOT/contracts/pvm"
DEPLOYMENTS_JSON="$REPO_ROOT/deployments.json"

# ---------------------------------------------------------------------------
# Network defaults
# ---------------------------------------------------------------------------

ETH_RPC_HTTP="${ETH_RPC_HTTP:-http://127.0.0.1:8545}"

# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Colour

info()    { echo -e "${GREEN}[smart-runtime]${NC} $*"; }
warn()    { echo -e "${YELLOW}[smart-runtime]${NC} $*"; }
error()   { echo -e "${RED}[smart-runtime]${NC} $*" >&2; }

# ---------------------------------------------------------------------------
# Dependency checks
# ---------------------------------------------------------------------------

require_cmd() {
    if ! command -v "$1" &>/dev/null; then
        error "Required command not found: $1"
        exit 1
    fi
}

check_deps() {
    require_cmd node
    require_cmd npm
    node_version=$(node --version | sed 's/v//' | cut -d. -f1)
    if [ "$node_version" -lt 22 ]; then
        error "Node.js 22+ required (found $(node --version))"
        exit 1
    fi
}

# ---------------------------------------------------------------------------
# Wait for eth-rpc to become available
# ---------------------------------------------------------------------------

wait_for_rpc() {
    local url="${ETH_RPC_HTTP}"
    local retries=30
    info "Waiting for eth-rpc at $url ..."
    for i in $(seq 1 $retries); do
        if curl -sf -X POST "$url" \
            -H 'Content-Type: application/json' \
            -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
            >/dev/null 2>&1; then
            info "eth-rpc is ready."
            return 0
        fi
        sleep 2
        echo -n "."
    done
    error "eth-rpc did not become available after $((retries * 2))s"
    exit 1
}
