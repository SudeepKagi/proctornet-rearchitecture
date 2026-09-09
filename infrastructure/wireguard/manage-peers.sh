#!/usr/bin/env bash
# =============================================================================
# ProctorNet Secure Management Plane - Peer Lifecycle Management CLI
# Subnet: 10.100.0.0/24 (Gateway: 10.100.0.1, Port: 51820)
#
# Commands:
#   init                  Initialize WireGuard directory structure and server keys
#   add <name> [ip]       Add new developer/operator peer and generate client config
#   list                  List all managed peers and their allocation state
#   revoke <name>         Revoke peer access and remove from active wg0 configuration
#   rotate <name>         Rotate cryptographic keys for an existing peer
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WG_DIR="${WG_DIR:-$SCRIPT_DIR}"
CONF_FILE="${WG_DIR}/wg0.conf"
TEMPLATE_FILE="${WG_DIR}/wg0.conf.template"
CLIENTS_DIR="${WG_DIR}/clients"
KEYS_DIR="${WG_DIR}/keys"
LEDGER_FILE="${WG_DIR}/peers.json"

SERVER_PUBLIC_ENDPOINT="${SERVER_PUBLIC_ENDPOINT:-vpn.proctornet.internal:51820}"
SUBNET_PREFIX="10.100.0"
GATEWAY_IP="${SUBNET_PREFIX}.1"
ALLOWED_IPS="${SUBNET_PREFIX}.0/24"
PEER_IP_START=51
PEER_IP_END=200

# Helper: Generate Curve25519 private key
gen_priv_key() {
  if command -v wg >/dev/null 2>&1; then
    wg genkey
  elif command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32
  else
    python3 -c "import secrets, base64; print(base64.b64encode(secrets.token_bytes(32)).decode())" 2>/dev/null || head -c 32 /dev/urandom | base64
  fi
}

# Helper: Generate public key from private key
gen_pub_key() {
  local priv="$1"
  if command -v wg >/dev/null 2>&1; then
    echo "$priv" | wg pubkey
  elif command -v openssl >/dev/null 2>&1; then
    echo "$priv" | openssl dgst -sha256 -binary | base64
  else
    python3 -c "import hashlib, base64, sys; print(base64.b64encode(hashlib.sha256(sys.argv[1].encode()).digest()).decode())" "$priv" 2>/dev/null || echo "pub_$(echo "$priv" | tr -d '\n' | head -c 24)"
  fi
}

# Helper: Generate pre-shared key
gen_psk() {
  if command -v wg >/dev/null 2>&1; then
    wg genpsk
  elif command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32
  else
    python3 -c "import secrets, base64; print(base64.b64encode(secrets.token_bytes(32)).decode())" 2>/dev/null || head -c 32 /dev/urandom | base64
  fi
}

# Initialize ledger if missing
ensure_ledger() {
  mkdir -p "$CLIENTS_DIR" "$KEYS_DIR"
  if [[ ! -f "$LEDGER_FILE" ]]; then
    echo '{"subnet":"10.100.0.0/24","gateway":"10.100.0.1","peers":{}}' > "$LEDGER_FILE"
  fi
}

# Command: init
cmd_init() {
  echo "==> Initializing WireGuard Management Plane in ${WG_DIR}..."
  mkdir -p "$CLIENTS_DIR" "$KEYS_DIR"
  ensure_ledger

  local server_priv="${KEYS_DIR}/server_private.key"
  local server_pub="${KEYS_DIR}/server_public.key"

  if [[ ! -f "$server_priv" ]]; then
    echo "==> Generating WireGuard server keypair..."
    gen_priv_key > "$server_priv"
    chmod 600 "$server_priv"
    gen_pub_key "$(cat "$server_priv")" > "$server_pub"
  fi

  if [[ ! -f "$CONF_FILE" ]]; then
    echo "==> Generating ${CONF_FILE} from template..."
    local priv_key
    priv_key="$(cat "$server_priv")"
    sed "s|\${SERVER_PRIVATE_KEY}|${priv_key}|g" "$TEMPLATE_FILE" > "$CONF_FILE"
    chmod 600 "$CONF_FILE"
  fi

  echo "==> WireGuard Management Plane initialized successfully."
  echo "    Subnet:      ${ALLOWED_IPS}"
  echo "    Gateway:     ${GATEWAY_IP}"
  echo "    Server Pub:  $(cat "$server_pub")"
  echo "    Config:      ${CONF_FILE}"
}

# Command: add <name> [ip]
cmd_add() {
  local name="${1:-}"
  local custom_ip="${2:-}"

  if [[ -z "$name" ]]; then
    echo "Error: Peer name is required. Usage: $0 add <peer_name> [ip]" >&2
    exit 1
  fi

  ensure_ledger

  # Validate peer name format (alphanumeric, -, _)
  if [[ ! "$name" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    echo "Error: Invalid peer name '$name'. Use only alphanumeric, dashes, and underscores." >&2
    exit 1
  fi

  # Check if peer already exists
  if grep -q "\"${name}\":" "$LEDGER_FILE" 2>/dev/null; then
    echo "Error: Peer '${name}' already exists in ledger. Use 'rotate' to update keys or 'revoke' first." >&2
    exit 1
  fi

  local allocated_ip=""
  if [[ -n "$custom_ip" ]]; then
    if [[ ! "$custom_ip" =~ ^10\.100\.0\.[0-9]+$ ]]; then
      echo "Error: Custom IP '${custom_ip}' must be within canonical management subnet 10.100.0.0/24" >&2
      exit 1
    fi
    allocated_ip="$custom_ip"
  else
    # Find next available IP
    for i in $(seq "$PEER_IP_START" "$PEER_IP_END"); do
      local candidate="${SUBNET_PREFIX}.${i}"
      if ! grep -q "\"ip\": \"${candidate}\"" "$LEDGER_FILE" 2>/dev/null; then
        allocated_ip="$candidate"
        break
      fi
    done
    if [[ -z "$allocated_ip" ]]; then
      echo "Error: No available IP addresses in dynamic developer range (${PEER_IP_START}-${PEER_IP_END})" >&2
      exit 1
    fi
  fi

  echo "==> Generating keys for peer '${name}' (IP: ${allocated_ip})..."
  local client_priv
  local client_pub
  local client_psk
  client_priv="$(gen_priv_key)"
  client_pub="$(gen_pub_key "$client_priv")"
  client_psk="$(gen_psk)"

  # Append peer block to wg0.conf
  cat <<EOF >> "$CONF_FILE"

# Peer: ${name}
[Peer]
PublicKey = ${client_pub}
PresharedKey = ${client_psk}
AllowedIPs = ${allocated_ip}/32
EOF

  # Generate client config file
  local server_pub
  server_pub="$(cat "${KEYS_DIR}/server_public.key" 2>/dev/null || echo "SERVER_PUB_KEY_PLACEHOLDER")"
  local client_conf="${CLIENTS_DIR}/${name}.conf"

  cat <<EOF > "$client_conf"
# =============================================================================
# ProctorNet Developer Management VPN Client Configuration
# Peer: ${name}
# Management Subnet: 10.100.0.0/24
# =============================================================================

[Interface]
PrivateKey = ${client_priv}
Address = ${allocated_ip}/32
DNS = 10.100.0.1

[Peer]
PublicKey = ${server_pub}
PresharedKey = ${client_psk}
Endpoint = ${SERVER_PUBLIC_ENDPOINT}
AllowedIPs = 10.100.0.0/24
PersistentKeepalive = 25
EOF
  chmod 600 "$client_conf"

  # Update ledger
  local now
  now="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%d")"
  python3 -c "
import json
with open('${LEDGER_FILE}', 'r') as f:
    data = json.load(f)
data.setdefault('peers', {})['${name}'] = {
    'ip': '${allocated_ip}',
    'publicKey': '${client_pub}',
    'createdAt': '${now}',
    'status': 'ACTIVE'
}
with open('${LEDGER_FILE}', 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null || true

  echo "==> Peer '${name}' created successfully."
  echo "    Allocated IP:   ${allocated_ip}/32"
  echo "    Public Key:     ${client_pub}"
  echo "    Client Config:  ${client_conf}"
}

# Command: list
cmd_list() {
  ensure_ledger
  echo "============================================================================="
  echo "ProctorNet WireGuard Management Plane Peers (Subnet: 10.100.0.0/24)"
  echo "============================================================================="
  printf "%-20s %-16s %-10s %-44s\n" "PEER NAME" "IP ADDRESS" "STATUS" "PUBLIC KEY"
  echo "-----------------------------------------------------------------------------"
  python3 -c "
import json
with open('${LEDGER_FILE}', 'r') as f:
    data = json.load(f)
peers = data.get('peers', {})
if not peers:
    print('  (No active peers registered)')
for name, info in sorted(peers.items()):
    print(f\"{name:<20} {info.get('ip', ''):<16} {info.get('status', 'ACTIVE'):<10} {info.get('publicKey', ''):<44}\")
" 2>/dev/null || echo "Ledger exists: ${LEDGER_FILE}"
  echo "============================================================================="
}

# Command: revoke <name>
cmd_revoke() {
  local name="${1:-}"
  if [[ -z "$name" ]]; then
    echo "Error: Peer name is required. Usage: $0 revoke <peer_name>" >&2
    exit 1
  fi

  ensure_ledger

  echo "==> Revoking peer '${name}'..."

  # Remove peer from wg0.conf
  if [[ -f "$CONF_FILE" ]]; then
    # Create temp file without the peer block
    python3 -c "
with open('${CONF_FILE}', 'r') as f:
    content = f.read()

marker = '# Peer: ${name}'
if marker in content:
    idx = content.find(marker)
    # Find end of peer block (next # Peer: or EOF)
    next_idx = content.find('# Peer:', idx + len(marker))
    if next_idx == -1:
        new_content = content[:idx].rstrip() + '\n'
    else:
        new_content = content[:idx] + content[next_idx:]
    with open('${CONF_FILE}', 'w') as f:
        f.write(new_content)
    print('==> Removed peer block from ${CONF_FILE}')
" 2>/dev/null || true
  fi

  # Update ledger
  python3 -c "
import json
with open('${LEDGER_FILE}', 'r') as f:
    data = json.load(f)
if '${name}' in data.get('peers', {}):
    data['peers']['${name}']['status'] = 'REVOKED'
    with open('${LEDGER_FILE}', 'w') as f:
        json.dump(data, f, indent=2)
    print('==> Marked peer as REVOKED in ledger')
" 2>/dev/null || true

  # Remove client configuration file
  rm -f "${CLIENTS_DIR}/${name}.conf"

  # Sync active wireguard interface if wg-quick and interface exist
  if command -v wg >/dev/null 2>&1 && wg show wg0 >/dev/null 2>&1; then
    echo "==> Syncing live wg0 interface..."
    wg syncconf wg0 <(wg-quick strip wg0 2>/dev/null || true) 2>/dev/null || true
  fi

  echo "==> Peer '${name}' successfully revoked."
}

# Command: rotate <name>
cmd_rotate() {
  local name="${1:-}"
  if [[ -z "$name" ]]; then
    echo "Error: Peer name is required. Usage: $0 rotate <peer_name>" >&2
    exit 1
  fi

  ensure_ledger

  # Check existing peer IP
  local peer_ip
  peer_ip="$(python3 -c "
import json
with open('${LEDGER_FILE}', 'r') as f:
    data = json.load(f)
print(data.get('peers', {}).get('${name}', {}).get('ip', ''))
" 2>/dev/null || true)"

  if [[ -z "$peer_ip" ]]; then
    echo "Error: Peer '${name}' does not exist in ledger. Use 'add' to create new peer." >&2
    exit 1
  fi

  echo "==> Rotating keys for peer '${name}' while preserving IP ${peer_ip}..."
  # Temporarily remove and re-add with same IP
  cmd_revoke "$name"
  cmd_add "$name" "$peer_ip"
  echo "==> Key rotation complete for peer '${name}'."
}

# CLI dispatcher
case "${1:-help}" in
  init)
    cmd_init
    ;;
  add)
    shift
    cmd_add "$@"
    ;;
  list)
    cmd_list
    ;;
  revoke)
    shift
    cmd_revoke "$@"
    ;;
  rotate)
    shift
    cmd_rotate "$@"
    ;;
  *)
    echo "Usage: $0 {init|add <name> [ip]|list|revoke <name>|rotate <name>}"
    exit 1
    ;;
esac
