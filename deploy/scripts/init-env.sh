#!/usr/bin/env bash
# Creates deploy/.env from .env.example and replaces every __GENERATE_*__ placeholder with a fresh
# random value. Safe to re-run: it never overwrites a value that is already set.
# Usage (on the server, from the deploy directory):  bash scripts/init-env.sh
set -euo pipefail
cd "$(dirname "$0")/.."

command -v openssl > /dev/null || { echo "openssl is required" >&2; exit 1; }

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi
chmod 600 .env

hex()     { openssl rand -hex 24; }
b64url()  { openssl rand -base64 48 | tr '+/' '-_' | tr -d '=\n'; }
key32()   { openssl rand -base64 32 | tr -d '\n'; }
zatca()   { openssl ecparam -name secp256k1 -genkey -noout 2> /dev/null | base64 | tr -d '\n'; }

fill() {
  local placeholder=$1 generator=$2 count=0
  while grep -q "=${placeholder}\$" .env; do
    local line value
    line=$(grep -n "=${placeholder}\$" .env | head -n1 | cut -d: -f1)
    value=$($generator)
    # Values never contain "|" (hex/base64 alphabets), so it is a safe sed delimiter.
    sed -i "${line}s|=${placeholder}\$|=${value}|" .env
    count=$((count + 1))
  done
  if ((count > 0)); then echo "Generated ${count} value(s) for ${placeholder}"; fi
}

fill __GENERATE_HEX__ hex
fill __GENERATE_B64URL__ b64url
fill __GENERATE_KEY32__ key32
fill __GENERATE_ZATCA_KEY__ zatca

echo
echo "Now edit .env and fill in the empty values (domain, R2, Unifonic, payments, seed owner, backups):"
echo "  nano .env"
echo "Then save an offline copy of the finished file in your password manager."
