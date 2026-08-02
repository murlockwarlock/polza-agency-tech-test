#!/usr/bin/env bash
set -euo pipefail

repository_url="$1"
revision="$2"
domain="$3"
install_root="/opt/polza-agency-tech-test"
repository_dir="$install_root/repository"
shared_dir="$install_root/shared"
nginx_available="/etc/nginx/sites-available/polza-agency-tech-test"
nginx_enabled="/etc/nginx/sites-enabled/polza-agency-tech-test"
nginx_backup="$shared_dir/nginx.backup"
relay_config="/etc/nginx/stream.d/relay.conf"
relay_backup="$shared_dir/relay.conf.backup"
compose=(docker compose --project-name polza-agency-tech-test --env-file "$shared_dir/.env" --file "$repository_dir/compose.production.yml")

rollback_nginx() {
  if [[ -f "$nginx_backup" ]]; then
    cp "$nginx_backup" "$nginx_available"
  else
    rm -f "$nginx_available" "$nginx_enabled"
  fi
  if [[ -f "$relay_backup" ]]; then
    cp "$relay_backup" "$relay_config"
  fi
  nginx -t >/dev/null 2>&1 && systemctl reload nginx || true
}

mkdir -p "$shared_dir"

if [[ "$domain" != "test.loonapie.xyz" ]]; then
  printf 'Unexpected domain\n' >&2
  exit 1
fi

if [[ ! -d "$repository_dir/.git" ]]; then
  git clone "$repository_url" "$repository_dir"
fi

git -C "$repository_dir" fetch --prune origin
git -C "$repository_dir" checkout --detach "$revision"

if [[ ! -f "$shared_dir/.env" ]]; then
  database_password="$(openssl rand -hex 24)"
  umask 077
  {
    printf 'POSTGRES_DB=polza\n'
    printf 'POSTGRES_USER=polza\n'
    printf 'POSTGRES_PASSWORD=%s\n' "$database_password"
    printf 'APP_PORT=3100\n'
  } > "$shared_dir/.env"
fi

if ss -ltnH 'sport = :3100' | grep -q . && ! docker ps --format '{{.Names}}' | grep -qx 'polza-agency-tech-test-app-1'; then
  printf 'Port 3100 is already occupied\n' >&2
  exit 1
fi

if ss -ltnH 'sport = :8447' | grep -q . && ! grep -qF 'test.loonapie.xyz 127.0.0.1:8447;' "$relay_config"; then
  printf 'Port 8447 is already occupied\n' >&2
  exit 1
fi

"${compose[@]}" up --detach --build --remove-orphans

for attempt in {1..30}; do
  if curl --fail --silent --show-error http://127.0.0.1:3100/api/health >/dev/null; then
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    printf 'Application health check failed\n' >&2
    exit 1
  fi
  sleep 2
done

mkdir -p /var/www/letsencrypt
if [[ -f "$nginx_available" ]]; then
  cp "$nginx_available" "$nginx_backup"
else
  rm -f "$nginx_backup"
fi
cp "$relay_config" "$relay_backup"

trap rollback_nginx ERR
cp "$repository_dir/ops/nginx-http.conf" "$nginx_available"
ln -sfn "$nginx_available" "$nginx_enabled"
nginx -t
systemctl reload nginx

if [[ ! -f "/etc/letsencrypt/live/$domain/fullchain.pem" ]]; then
  certbot certonly \
    --webroot \
    --webroot-path /var/www/letsencrypt \
    --domain "$domain" \
    --non-interactive \
    --agree-tos \
    --register-unsafely-without-email
fi

cp "$repository_dir/ops/nginx-https.conf" "$nginx_available"
if ! grep -qF 'test.loonapie.xyz 127.0.0.1:8447;' "$relay_config"; then
  sed -i '/^[[:space:]]*default[[:space:]]/i\    test.loonapie.xyz 127.0.0.1:8447;' "$relay_config"
fi
nginx -t
systemctl reload nginx

printf '%s\n' "$revision" > "$install_root/REVISION"
trap - ERR
"${compose[@]}" ps
