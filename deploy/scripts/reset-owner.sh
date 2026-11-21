#!/usr/bin/env bash
# Changes the store owner's sign-in email and sets a new random password, then signs out every
# session of that account. Run on the server, from the deploy directory:
#   bash scripts/reset-owner.sh owner@example.com              # keep the current 2FA app
#   bash scripts/reset-owner.sh owner@example.com --reset-2fa  # also re-enrol 2FA at next sign-in
# The new password is printed once. Store it in your password manager.
set -euo pipefail
cd "$(dirname "$0")/.."

email="${1:-}"
reset2fa=0
[[ "${2:-}" == "--reset-2fa" ]] && reset2fa=1
[[ "${email}" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || {
  echo "Usage: bash scripts/reset-owner.sh <new-email> [--reset-2fa]" >&2
  exit 1
}

# 24 characters from the base64url alphabet: strong, and safe to type or paste anywhere.
password="$(openssl rand -base64 24 | tr '+/' '-_' | tr -d '=\n' | cut -c1-24)"

read -r -d '' js << 'EOF' || true
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
(async () => {
  const prisma = new PrismaClient();
  try {
    const email = process.env.NEW_EMAIL.trim().toLowerCase();
    const owners = await prisma.user.findMany({
      where: { kind: 'STAFF', roles: { some: { role: { key: 'owner' } } } },
      select: { id: true, email: true },
    });
    if (owners.length !== 1) {
      throw new Error(`expected exactly 1 owner account, found ${owners.length}: ${owners.map((o) => o.email).join(', ')}`);
    }
    const owner = owners[0];
    const clash = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (clash && clash.id !== owner.id) throw new Error(`${email} already belongs to another account`);
    // Same parameters as StaffAuthService.hashPassword.
    const passwordHash = await argon2.hash(process.env.NEW_PASSWORD, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
    await prisma.$transaction([
      prisma.user.update({ where: { id: owner.id }, data: { email, passwordHash, status: 'ACTIVE' } }),
      prisma.session.updateMany({ where: { userId: owner.id, revokedAt: null }, data: { revokedAt: new Date() } }),
      ...(process.env.RESET_2FA === '1' ? [prisma.totpSecret.deleteMany({ where: { userId: owner.id } })] : []),
    ]);
    console.log(`reset-owner: ${owner.email} -> ${email}`);
    if (process.env.RESET_2FA === '1') console.log('reset-owner: 2FA removed; set it up again at the next sign-in');
  } finally {
    await prisma.$disconnect();
  }
})().catch((err) => {
  console.error(`reset-owner: ${err.message}`);
  process.exit(1);
});
EOF

docker compose run --rm --no-deps -T \
  -e NEW_EMAIL="${email}" -e NEW_PASSWORD="${password}" -e RESET_2FA="${reset2fa}" \
  api node -e "${js}"

echo
echo "Sign in at https://$(grep '^DOMAIN=' .env | cut -d= -f2)/admin/ar/login"
echo "  Email:    ${email,,}"
echo "  Password: ${password}"
echo "This password is shown only once. Save it in your password manager now."
