#!/usr/bin/env bash
# Builds the image on this machine, ships it to the VPS over ssh, switches the container and
# waits for the new version to answer on /api/health. Rolls back if it never does.
#
#   ops/deploy.sh                 full deploy (preflight -> build -> smoke -> ship -> switch -> verify)
#   ops/deploy.sh --skip-tests    skip the preflight checks (typecheck, lint, unit tests)
#   ops/deploy.sh --build-only    build + local smoke test, do not ship
#   ops/deploy.sh --rollback      switch the box back to the previous tag
#   ops/deploy.sh --nginx         (re)install the nginx site and get/renew the certificate
#
# Needs ops/deploy.env (see ops/deploy.env.example) and, on the box, $REMOTE_DIR/.env with the
# runtime secrets (ANTHROPIC_API_KEY etc.). The image is never built on the box: it has 2 GB RAM.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=ops/deploy.env
[[ -f $ENV_FILE ]] || { echo "missing $ENV_FILE (copy ops/deploy.env.example)" >&2; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE"
: "${REMOTE:?}" "${REMOTE_DIR:?}" "${DOMAIN:?}" "${HOST_PORT:?}"

IMAGE=doc-extraction-tool
SKIP_TESTS=0; BUILD_ONLY=0; ROLLBACK=0; NGINX=0
for arg in "$@"; do
  case $arg in
    --skip-tests) SKIP_TESTS=1 ;;
    --build-only) BUILD_ONLY=1 ;;
    --rollback) ROLLBACK=1 ;;
    --nginx) NGINX=1 ;;
    *) echo "unknown flag $arg" >&2; exit 2 ;;
  esac
done

log() { printf '\n==> %s\n' "$*"; }
remote() { ssh -o BatchMode=yes "$REMOTE" "bash -s -- $(printf '%q ' "$@")"; }

install_nginx() {
  log "Installing nginx site for $DOMAIN on $REMOTE"
  local conf
  if ssh -o BatchMode=yes "$REMOTE" "sudo test -d /etc/letsencrypt/live/$DOMAIN"; then conf=ops/nginx/site.conf; else conf=ops/nginx/site-http.conf; fi
  # The rendered config travels as a base64 argument: stdin already carries the remote script.
  local rendered
  rendered="$(sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__PORT__/$HOST_PORT/g" "$conf" | base64 -w0)"
  remote "$DOMAIN" "$conf" "$rendered" <<'SCRIPT'
set -euo pipefail
domain="$1"; conf="$2"
printf '%s' "$3" | base64 -d | sudo tee /etc/nginx/sites-available/docextract >/dev/null
sudo ln -sf /etc/nginx/sites-available/docextract /etc/nginx/sites-enabled/docextract
sudo nginx -t
sudo systemctl reload nginx
if [[ $conf == *site-http.conf ]]; then
  sudo certbot certonly --webroot -w /var/www/html -d "$domain" --non-interactive --agree-tos --register-unsafely-without-email
  echo "certificate issued; run ops/deploy.sh --nginx again to install the HTTPS config"
fi
SCRIPT
}

rollback() {
  log "Rolling back on $REMOTE"
  remote "$REMOTE_DIR" "$IMAGE" <<'SCRIPT'
set -euo pipefail
cd "$1"
prev="$(cat PREVIOUS_TAG 2>/dev/null || true)"
[[ -n $prev ]] || { echo "no PREVIOUS_TAG to roll back to" >&2; exit 1; }
docker tag "$2:$prev" "$2:latest"
echo "$prev" > CURRENT_TAG
APP_VERSION="$prev" docker compose up -d --remove-orphans
echo "rolled back to $prev"
SCRIPT
}

if (( NGINX )); then install_nginx; exit 0; fi
if (( ROLLBACK )); then rollback; exit 0; fi

if (( ! SKIP_TESTS )); then
  log "Preflight: typecheck, lint, format, unit tests"
  pnpm check
fi

TAG="$(date +%Y%m%d-%H%M)-$(git rev-parse --short HEAD)$(git diff --quiet || echo -dirty)"
log "Building $IMAGE:$TAG"
docker build --platform linux/amd64 --build-arg "APP_VERSION=$TAG" -t "$IMAGE:$TAG" .

log "Local smoke test"
SMOKE=docextract-smoke
docker rm -f "$SMOKE" >/dev/null 2>&1 || true
docker run -d --name "$SMOKE" -e LLM_PROVIDER=mock -p 127.0.0.1:3199:3000 "$IMAGE:$TAG" >/dev/null
trap 'docker rm -f "$SMOKE" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 30); do
  body="$(curl -fsS http://127.0.0.1:3199/api/health 2>/dev/null || true)"
  [[ $body == *"\"version\":\"$TAG\""* ]] && break
  sleep 1
done
[[ $body == *"\"version\":\"$TAG\""* ]] || { echo "smoke: health never reported $TAG ($body)" >&2; docker logs "$SMOKE" | tail -20; exit 1; }
curl -fsS http://127.0.0.1:3199/ | grep -q '<div id="root">' || { echo "smoke: frontend not served" >&2; exit 1; }
curl -fsS http://127.0.0.1:3199/api/samples | grep -q '"id"' || { echo "smoke: samples missing" >&2; exit 1; }
job="$(curl -fsS -X POST http://127.0.0.1:3199/api/samples/dry-creek-2017/process | sed -E 's/.*"id":"([^"]+)".*/\1/')"
for _ in $(seq 1 60); do
  status="$(curl -fsS "http://127.0.0.1:3199/api/documents/$job" || true)"
  [[ $status == *'"status":"done"'* ]] && break
  [[ $status == *'"status":"failed"'* ]] && { echo "smoke: mock extraction failed: $status" >&2; exit 1; }
  sleep 1
done
[[ $status == *'"status":"done"'* ]] || { echo "smoke: mock extraction never finished" >&2; exit 1; }
docker rm -f "$SMOKE" >/dev/null
trap - EXIT
log "Smoke test passed"
(( BUILD_ONLY )) && exit 0

log "Shipping $IMAGE:$TAG to $REMOTE"
docker save "$IMAGE:$TAG" | gzip -1 | ssh -o BatchMode=yes "$REMOTE" 'gunzip | docker load'

log "Switching $REMOTE to $TAG"
remote "$REMOTE_DIR" <<'SCRIPT'
set -euo pipefail
mkdir -p "$1"
test -f "$1/.env" || { echo "Missing $1/.env on the box. Create it from .env.example (ANTHROPIC_API_KEY at least)." >&2; exit 1; }
SCRIPT
sed -e "s/\${HOST_PORT:-3120}/$HOST_PORT/" docker-compose.yml | ssh -o BatchMode=yes "$REMOTE" "cat > $(printf '%q' "$REMOTE_DIR/docker-compose.yml")"
remote "$REMOTE_DIR" "$IMAGE" "$TAG" <<'SCRIPT'
set -euo pipefail
cd "$1"; image="$2"; tag="$3"
docker image inspect "$image:$tag" >/dev/null
current="$(cat CURRENT_TAG 2>/dev/null || true)"
if [[ -n $current && $current != "$tag" ]]; then echo "$current" > PREVIOUS_TAG; fi
docker tag "$image:$tag" "$image:latest"
echo "$tag" > CURRENT_TAG
APP_VERSION="$tag" docker compose up -d --remove-orphans --no-build
SCRIPT

log "Waiting for $TAG to report healthy"
if ! remote "$HOST_PORT" "$TAG" <<'SCRIPT'
set -uo pipefail
for _ in $(seq 1 45); do
  body="$(curl -fsS "http://127.0.0.1:$1/api/health" 2>/dev/null || true)"
  [[ $body == *"\"version\":\"$2\""* ]] && { echo "healthy: $2"; exit 0; }
  sleep 2
done
echo "health never reported $2 (last: ${body:-none})" >&2
exit 1
SCRIPT
then
  rollback
  exit 1
fi

log "Pruning old images on $REMOTE"
remote "$REMOTE_DIR" "$IMAGE" <<'SCRIPT'
set -euo pipefail
cd "$1"
keep="$(cat CURRENT_TAG) $(cat PREVIOUS_TAG 2>/dev/null || true)"
for t in $(docker images "$2" --format '{{.Tag}}' | grep -v latest | sort -r | tail -n +4); do
  [[ " $keep " == *" $t "* ]] || docker rmi "$2:$t" >/dev/null || true
done
SCRIPT

log "Public check"
curl -fsS "https://$DOMAIN/api/health" | grep -q "\"version\":\"$TAG\"" && echo "https://$DOMAIN is on $TAG"
