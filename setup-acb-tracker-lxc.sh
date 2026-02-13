#!/bin/bash
# setup-acb-tracker-lxc.sh
# Run from a Proxmox host to create an Alpine LXC and deploy the ACB Tracker app.
#
# Usage:
#   bash setup-acb-tracker-lxc.sh
#
# Override defaults with environment variables:
#   VMID=201 LXC_IP=10.0.0.50/24 GW=10.0.0.1 bash setup-acb-tracker-lxc.sh

set -euo pipefail

# ─── Configuration (override via env vars) ───
VMID="${VMID:-200}"
HOSTNAME="${HOSTNAME:-acb-tracker}"
STORAGE="${STORAGE:-local-lvm}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
DISK_SIZE="${DISK_SIZE:-2}"
RAM="${RAM:-256}"
CORES="${CORES:-1}"
BRIDGE="${BRIDGE:-vmbr0}"
LXC_IP="${LXC_IP:-dhcp}"
GW="${GW:-}"
REPO_URL="${REPO_URL:-https://github.com/codepoet4/chess-analyzer.git}"
APP_PORT="${APP_PORT:-8080}"

# ─── Resolve network flags ───
if [ "$LXC_IP" = "dhcp" ]; then
  NET_CONF="name=eth0,bridge=${BRIDGE},ip=dhcp"
else
  NET_CONF="name=eth0,bridge=${BRIDGE},ip=${LXC_IP}"
  [ -n "$GW" ] && NET_CONF="${NET_CONF},gw=${GW}"
fi

echo "==> Creating Alpine LXC (VMID=${VMID}) for ACB Tracker"

# ─── Download Alpine template if needed ───
TEMPLATE=$(pveam available --section system | grep -oP 'alpine-3\.\d+-default_\S+' | sort -V | tail -1)
if [ -z "$TEMPLATE" ]; then
  echo "ERROR: No Alpine template found in pveam." >&2
  exit 1
fi

if ! pveam list "$TEMPLATE_STORAGE" | grep -q "$TEMPLATE"; then
  echo "==> Downloading template: ${TEMPLATE}"
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"
fi

TEMPLATE_PATH="${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}"

# ─── Create container ───
echo "==> Creating container"
pct create "$VMID" "$TEMPLATE_PATH" \
  --hostname "$HOSTNAME" \
  --storage "$STORAGE" \
  --rootfs "${STORAGE}:${DISK_SIZE}" \
  --memory "$RAM" \
  --cores "$CORES" \
  --net0 "$NET_CONF" \
  --unprivileged 1 \
  --onboot 1 \
  --start 0

# ─── Start container ───
echo "==> Starting container"
pct start "$VMID"
sleep 3

# ─── Helper to run commands inside the LXC ───
run() { pct exec "$VMID" -- sh -c "$1"; }

# ─── Wait for networking ───
echo "==> Waiting for network"
for i in $(seq 1 15); do
  if run "ping -c1 -W1 dl-cdn.alpinelinux.org" >/dev/null 2>&1; then break; fi
  sleep 2
done

# ─── Install packages ───
echo "==> Installing packages"
run "apk update && apk add --no-cache nodejs npm git nginx"

# ─── Clone and build the app ───
echo "==> Cloning repository"
run "git clone ${REPO_URL} /opt/acb-tracker"

echo "==> Building app"
run "cd /opt/acb-tracker && npm install && npm run build"

# ─── Configure nginx ───
echo "==> Configuring nginx"
run "cat > /etc/nginx/http.d/acb-tracker.conf << 'NGINX'
server {
    listen ${APP_PORT} default_server;
    root /opt/acb-tracker/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 30d;
        add_header Cache-Control \"public, immutable\";
    }
}
NGINX"

# Remove the default site if it exists
run "rm -f /etc/nginx/http.d/default.conf"

# ─── Enable nginx on boot and start it ───
echo "==> Enabling nginx"
run "rc-update add nginx default"
run "rc-service nginx start"

# ─── Print result ───
echo ""
echo "======================================"
echo "  ACB Tracker LXC is ready"
echo "======================================"
echo "  VMID:     ${VMID}"
echo "  Hostname: ${HOSTNAME}"
echo "  Port:     ${APP_PORT}"

if [ "$LXC_IP" = "dhcp" ]; then
  IP=$(run "ip -4 addr show eth0" 2>/dev/null | grep -oP 'inet \K[\d.]+' || echo "unknown")
  echo "  IP:       ${IP} (DHCP)"
else
  echo "  IP:       ${LXC_IP%%/*}"
fi

echo ""
echo "  Open: http://\${IP}:${APP_PORT}"
echo "======================================"
