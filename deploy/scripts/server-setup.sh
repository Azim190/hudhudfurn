#!/usr/bin/env bash
# One-time preparation of a fresh Ubuntu 22.04/24.04 VPS (Hostinger KVM or similar). Run as root:
#   bash server-setup.sh
# Installs Docker, creates the "deploy" user and /opt/hudhud, adds swap, turns on the firewall,
# automatic security updates and fail2ban, and switches SSH to key-only sign-in once a key exists.
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run as root." >&2; exit 1; }

DEPLOY_USER=deploy
APP_DIR=/opt/hudhud

echo "==> System updates"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl ufw fail2ban unattended-upgrades openssl

echo "==> Docker"
if ! command -v docker > /dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "==> User ${DEPLOY_USER}"
if ! id "${DEPLOY_USER}" > /dev/null 2>&1; then
  adduser --disabled-password --gecos "" "${DEPLOY_USER}"
fi
usermod -aG docker "${DEPLOY_USER}"
install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
if [[ -s /root/.ssh/authorized_keys && ! -s "/home/${DEPLOY_USER}/.ssh/authorized_keys" ]]; then
  cp /root/.ssh/authorized_keys "/home/${DEPLOY_USER}/.ssh/authorized_keys"
fi
touch "/home/${DEPLOY_USER}/.ssh/authorized_keys"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh/authorized_keys"
chmod 600 "/home/${DEPLOY_USER}/.ssh/authorized_keys"

echo "==> ${APP_DIR}"
install -d -m 750 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${APP_DIR}"
install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${APP_DIR}/certs"

echo "==> Swap"
if ! swapon --show | grep -q .; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10 > /dev/null
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-hudhud.conf
fi

echo "==> Firewall"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Automatic security updates and fail2ban"
dpkg-reconfigure -f noninteractive unattended-upgrades
systemctl enable --now fail2ban

echo "==> SSH"
if [[ -s "/home/${DEPLOY_USER}/.ssh/authorized_keys" ]]; then
  cat > /etc/ssh/sshd_config.d/99-hudhud.conf << 'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
  sshd -t
  systemctl reload ssh 2> /dev/null || systemctl reload sshd
  echo "Password sign-in is now off. Sign in with your SSH key as ${DEPLOY_USER} or root."
else
  echo "WARNING: no SSH key found, so password sign-in is still on."
  echo "Add your public key to /home/${DEPLOY_USER}/.ssh/authorized_keys, then run this script again."
fi

echo
echo "Done. Next: copy the deploy folder to ${APP_DIR} and follow deploy/README.md (step 3)."
