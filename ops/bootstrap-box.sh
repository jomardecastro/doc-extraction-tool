#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 VPS (2 GB RAM is enough). Run from the workstation:
#
#   ops/bootstrap-box.sh <ip> [root key file]
#
# As root: updates, Docker, nginx, certbot, ufw (SSH/80/443), fail2ban, 1 GB swap, nginx reload
# after certificate renewals, and the deploy user `jomar` (uid 1001 = the container user, docker
# group, passwordless sudo, same SSH key). Then proves `ssh jomar@<ip>` works and turns off root
# and password logins. Safe to re-run. Afterwards add the ~/.ssh/config entry it prints.
set -euo pipefail
IP="${1:?usage: ops/bootstrap-box.sh <ip> [root key file]}"
ROOT_KEY="${2:-$HOME/.ssh/id_ed25519}"
MAIN_PUB="$HOME/.ssh/id_ed25519.pub"
[[ -f "$ROOT_KEY" && -f "$MAIN_PUB" ]] || { echo "missing $ROOT_KEY or $MAIN_PUB" >&2; exit 1; }
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new)

echo "==> Step 1: packages, user, firewall, swap (as root@$IP)"
ssh "${SSH_OPTS[@]}" -i "$ROOT_KEY" "root@$IP" "bash -s -- $(printf '%q' "$(cat "$MAIN_PUB")")" <<'SCRIPT'
set -euo pipefail
main_pub="$1"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get -yq -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold upgrade
apt-get install -yq docker.io docker-compose-v2 nginx certbot ufw fail2ban unattended-upgrades curl
if ! id jomar >/dev/null 2>&1; then
  if getent passwd 1001 >/dev/null || getent group 1001 >/dev/null; then
    echo "uid or gid 1001 is already taken; the container runs as 1001, so sort that out first." >&2
    exit 1
  fi
  groupadd -g 1001 jomar
  useradd -m -u 1001 -g 1001 -s /bin/bash jomar
fi
usermod -aG sudo,docker jomar
install -d -m 700 -o jomar -g jomar /home/jomar/.ssh
install -m 600 -o jomar -g jomar /root/.ssh/authorized_keys /home/jomar/.ssh/authorized_keys
grep -qxF "$main_pub" /home/jomar/.ssh/authorized_keys || echo "$main_pub" >>/home/jomar/.ssh/authorized_keys
echo 'jomar ALL=(ALL) NOPASSWD:ALL' >/etc/sudoers.d/90-jomar
chmod 440 /etc/sudoers.d/90-jomar
visudo -cf /etc/sudoers.d/90-jomar >/dev/null
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
if ! swapon --show | grep -q .; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi
echo 'vm.swappiness=10' >/etc/sysctl.d/90-swappiness.conf
sysctl -q -p /etc/sysctl.d/90-swappiness.conf
mkdir -p /var/www/html
# nginx: no version header, reload after certbot renewals, catch-all that drops unknown hosts
sed -i 's/^\s*#\?\s*server_tokens.*/\tserver_tokens off;/' /etc/nginx/nginx.conf
install -d /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nsystemctl reload nginx\n' >/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
cat >/etc/nginx/sites-available/default <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 444; }
}
NGINX
nginx -t && systemctl reload nginx
systemctl enable --now fail2ban docker >/dev/null
echo "step 1 done"
SCRIPT

echo "==> Step 2: proving jomar@$IP works, then disabling root and password logins"
ssh "${SSH_OPTS[@]}" "jomar@$IP" 'sudo -n true && docker ps >/dev/null && echo "jomar ok"'
ssh "${SSH_OPTS[@]}" "jomar@$IP" 'bash -s' <<'SCRIPT'
set -euo pipefail
sudo install -d /etc/ssh/sshd_config.d
printf 'PermitRootLogin no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\n' | sudo tee /etc/ssh/sshd_config.d/90-hardening.conf >/dev/null
sudo sshd -t && sudo systemctl reload ssh
echo "hardened"
SCRIPT

cat <<EOF

Done. Add to ~/.ssh/config:

Host docextract
    HostName $IP
    User jomar
    IdentityFile ~/.ssh/id_ed25519

Then: copy .env.example to $HOME/docextract/.env on the box (ANTHROPIC_API_KEY, DAILY_USD_CAP),
point DNS at $IP, run ops/deploy.sh --nginx (cert), ops/deploy.sh --nginx (HTTPS config), ops/deploy.sh.
EOF
