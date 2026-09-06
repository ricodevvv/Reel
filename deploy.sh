#!/usr/bin/env bash
#
# Euronic Reel, from nothing to running.
#
#   ./deploy.sh                        install what is missing, generate secrets, bring it up
#   ./deploy.sh domain <host> [mail]   put nginx and a Let's Encrypt certificate in front of it
#   ./deploy.sh spotify <id> <secret>  turn on reading Spotify playlists
#   ./deploy.sh update                 rebuild from the current checkout and restart
#   ./deploy.sh update-fetcher         rebuild the yt-dlp image, which is how yt-dlp is updated
#   ./deploy.sh password               set a new panel password
#   ./deploy.sh status                 what is running
#   ./deploy.sh logs [service]         follow the logs
#   ./deploy.sh down                   stop it (nothing is deleted)
#
# Safe to run twice. An existing .env is never overwritten, so re-running after a git pull is the
# ordinary way to update.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT/.env"
DEFAULT_DATA_ROOT="/opt/euronic-reel/data"
WORKER_IMAGE="euronic/reel-worker:local"
FETCHER_IMAGE="euronic/reel-fetcher:local"
NGINX_SITE="euronic-reel"

log()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarn:\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }

# Docker needs root, and so does writing under /etc and /opt. Running the whole script as root is
# the common case on a fresh VPS; sudo covers the other one.
as_root() { if [[ "$(id -u)" == "0" ]]; then "$@"; else sudo "$@"; fi }

compose() { as_root docker compose --project-directory "$ROOT" -f "$ROOT/compose.yaml" --env-file "$ENV_FILE" "$@"; }

random_hex() { od -An -tx1 -N"${1:-32}" /dev/urandom | tr -d ' \n'; }

interactive() { [[ -t 0 ]]; }

# Read rather than sourced: an .env is not a shell script, and treating one as such is how a stray
# character in a generated secret turns into an executed command.
#
# A key that is not there is an empty answer, not a failure. That distinction is load-bearing: grep
# exits 1 when it matches nothing, pipefail hands that to the assignment that called this, and
# `set -e` then kills the whole script without printing a word. An .env written by an older version
# of this script is missing every key added since, so without the `|| true` the first read of a new
# key ends the run in silence.
env_get() {
  [[ -f "$ENV_FILE" ]] || return 0
  grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true
}

# Replaces a key in place, or appends it. Written through a temporary file and copied back, so an
# interrupted write cannot leave half a value behind, and the original keeps its own permissions.
env_set() {
  local key="$1" value="$2" pending
  pending="$(mktemp)"
  awk -v line="$key=$value" -v key="^$key=" '
    $0 ~ key { print line; found = 1; next }
    { print }
    END { if (!found) print line }
  ' "$ENV_FILE" > "$pending"
  cat "$pending" > "$ENV_FILE"
  rm -f "$pending"
}

detect_packager() {
  [[ -n "$PACKAGER" ]] && return 0
  for candidate in apt-get dnf yum; do
    if command -v "$candidate" >/dev/null 2>&1; then
      PACKAGER="$candidate"
      return 0
    fi
  done
  return 1
}

install_packages() {
  detect_packager || die "no apt-get, dnf or yum here. Install $* yourself and run this again."
  log "installing $*"
  case "$PACKAGER" in
    apt-get)
      as_root env DEBIAN_FRONTEND=noninteractive apt-get update -qq
      as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" ;;
    dnf|yum)
      as_root "$PACKAGER" install -y -q "$@" ;;
  esac
}

install_docker() {
  if as_root docker compose version >/dev/null 2>&1; then
    log "docker $(as_root docker version --format '{{.Server.Version}}' 2>/dev/null || echo '?') is already here"
    return
  fi

  if command -v docker >/dev/null 2>&1; then
    die "docker is installed but 'docker compose' is not. Install the compose plugin (docker-compose-plugin) and run this again."
  fi

  log "installing docker"
  command -v curl >/dev/null 2>&1 || install_packages curl
  # The official convenience script. It knows every distribution's package layout, which is the
  # part that is genuinely tedious to get right by hand.
  curl -fsSL https://get.docker.com | as_root sh

  as_root systemctl enable --now docker 2>/dev/null || true
  as_root docker compose version >/dev/null 2>&1 || die "docker installed, but 'docker compose' still is not available."
}

nginx_config_path() {
  # Debian keeps sites in sites-available and symlinks them; everyone else drops a file in conf.d.
  if [[ -d /etc/nginx/sites-available ]]; then
    printf '/etc/nginx/sites-available/%s' "$NGINX_SITE"
  else
    printf '/etc/nginx/conf.d/%s.conf' "$NGINX_SITE"
  fi
}

write_nginx_site() {
  local domain="$1" port="$2" path listen6=""
  path="$(nginx_config_path)"
  log "writing $path"

  # Only listen on IPv6 where there is IPv6. A "listen [::]:80" on a host without it does not
  # degrade: nginx fails the whole configuration with "Address family not supported by protocol"
  # and refuses to start, taking the panel down with it. Plenty of VPS images ship that way.
  if [[ -f /proc/net/if_inet6 ]]; then
    listen6=$'\n    listen [::]:80;'
  else
    log "no IPv6 on this host, listening on IPv4 only"
  fi

  # Plain HTTP only, on purpose: `certbot --nginx` edits this file itself to add the 443 server and
  # the redirect, and it does that better than a template can.
  as_root tee "$path" >/dev/null <<NGINX
# Euronic Reel. Written by deploy.sh; certbot adds the TLS half.
server {
    listen 80;$listen6
    server_name $domain;

    # nginx defaults to 1m, and a panel that streams files back through itself should not
    # have a limit that small standing in front of it.
    client_max_body_size 64m;

    location / {
        proxy_pass http://127.0.0.1:$port;
        proxy_http_version 1.1;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        # The panel reads this to decide whether the session cookie gets its Secure flag.
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";

        # The live download log is server-sent events. With buffering on, nginx holds the whole
        # response and hands it over in one lump when the build ends, which is the exact thing this
        # panel exists to avoid. The timeouts are the same story: a download runs for minutes, and the
        # 60s default would drop the stream halfway through.
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
NGINX

  if [[ -d /etc/nginx/sites-enabled ]]; then
    as_root ln -sf "$path" "/etc/nginx/sites-enabled/$NGINX_SITE"
    # Debian's packaged default site answers on port 80 for any name, and shadows this one on a
    # request that arrives without a matching Host. Nothing here needs it.
    as_root rm -f /etc/nginx/sites-enabled/default
  fi

  as_root nginx -t
  as_root systemctl reload nginx 2>/dev/null || as_root systemctl restart nginx
}

# The DNS has to point here before certbot asks Let's Encrypt to prove it, so a mismatch is worth
# saying out loud. A warning rather than an error: split-horizon DNS and proxies both make this
# comparison wrong sometimes, and being wrong should not stop someone who knows better.
check_dns() {
  local domain="$1" resolved="" public=""
  # `|| true` inside the substitution, not outside it: getent exits 2 for a name it cannot resolve,
  # pipefail hands that to the assignment, and `set -e` would then end the run — on exactly the case
  # this function exists to warn about and carry on from.
  if command -v getent >/dev/null 2>&1; then
    resolved="$(getent ahostsv4 "$domain" 2>/dev/null | awk 'NR==1{print $1}' || true)"
  fi
  public="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"

  if [[ -z "$resolved" ]]; then
    warn "$domain does not resolve yet. Certbot will fail until it does."
  elif [[ -n "$public" && "$resolved" != "$public" ]]; then
    warn "$domain resolves to $resolved, but this host looks like $public."
    warn "Unless that is deliberate, fix the DNS record before the certificate is requested."
  else
    log "$domain resolves to $resolved"
  fi
}

open_firewall() {
  if command -v ufw >/dev/null 2>&1 && as_root ufw status 2>/dev/null | grep -q '^Status: active'; then
    log "opening 80 and 443 in ufw"
    as_root ufw allow 'Nginx Full' >/dev/null 2>&1 || as_root ufw allow 80,443/tcp >/dev/null 2>&1 || true
  fi
}

obtain_certificate() {
  local domain="$1" email="$2"
  log "asking Let's Encrypt for a certificate"

  local args=(--nginx -d "$domain" --non-interactive --agree-tos --redirect)
  if [[ -n "$email" ]]; then
    args+=(-m "$email")
  else
    args+=(--register-unsafely-without-email)
  fi

  if as_root certbot "${args[@]}"; then
    log "certbot installed the certificate and renews it on its own timer"
    return 0
  fi

  warn "certbot could not get a certificate. nginx is still serving the panel over plain HTTP at"
  warn "http://$domain. The usual causes are DNS that has not propagated yet, and port 80 being"
  warn "closed. Fix that, then run: ./deploy.sh domain $domain${email:+ $email}"
  return 1
}

# ---- who has the port ---------------------------------------------------------------------------

# What is listening on a TCP port, named as usefully as this host can name it.
#
# A published container port is the likely answer on a machine that already runs something, and it
# is also the one `ss` describes least helpfully — it shows docker-proxy, or nothing at all when the
# daemon publishes without one — so Docker gets asked first.
port_owner() {
  local port="$1" container process

  container="$(as_root docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null | grep -F ":$port->" | cut -f1 | head -1 || true)"
  if [[ -n "$container" ]]; then
    printf 'the container %s' "$container"
    return 0
  fi

  process="$(as_root ss -lptnH "sport = :$port" 2>/dev/null | grep -oE 'users:\(\("[^"]+"' | head -1 | sed 's/.*"\(.*\)"/\1/' || true)"
  if [[ -n "$process" ]]; then
    printf '%s' "$process"
    return 0
  fi
  return 1
}

# ---- images and secrets --------------------------------------------------------------------------

# Built before the env file is written, because hashing the password is a job for the same scrypt
# parameters the service verifies with, and the image is where those live.
build_worker_image() {
  log "building the worker image"
  as_root docker build --quiet -t "$WORKER_IMAGE" -f "$ROOT/Dockerfile.worker" "$ROOT" >/dev/null
}

# Separate from the worker because it is rebuilt on its own schedule: sites change, yt-dlp follows
# them weekly, and --no-cache is what makes the rebuild actually pick up a newer one.
build_fetcher_image() {
  log "building the fetcher image (yt-dlp and ffmpeg)"
  as_root docker build ${1:-} --quiet -t "$FETCHER_IMAGE" -f "$ROOT/Dockerfile.fetcher" "$ROOT" >/dev/null
  log "yt-dlp $(as_root docker run --rm "$FETCHER_IMAGE" yt-dlp --version 2>/dev/null || echo '?')"
}

hash_password() {
  as_root docker run --rm "$WORKER_IMAGE" node dist/hash.js "$1"
}

write_env() {
  local password="$1" data_root="$2" bind="$3" domain="$4"
  log "writing $ENV_FILE"
  # The umask is set in a subshell so it applies to this file and nothing else the script creates.
  ( umask 077
    cat > "$ENV_FILE" <<ENV
# Written by deploy.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ). See .env.example for what each of these
# does. Keep this file out of version control: it holds the panel's credentials.
REEL_DATA_ROOT=$data_root
REEL_PASSWORD_HASH=$(hash_password "$password")
REEL_SESSION_SECRET=$(random_hex 32)
REEL_API_TOKEN=$(random_hex 24)

# Set by 'deploy.sh domain'. Empty means nothing is proxying this.
REEL_DOMAIN=$domain
REEL_BIND=$bind
REEL_HTTP_PORT=3200

REEL_MAX_CONCURRENT_JOBS=2
REEL_JOB_TIMEOUT_SECONDS=3600
REEL_JOB_MEMORY=1g
REEL_MAX_ITEMS=50
REEL_JOB_RETENTION=50

# Set by 'deploy.sh spotify'. Reads a public playlist's track list; there is no audio behind it.
REEL_SPOTIFY_CLIENT_ID=
REEL_SPOTIFY_CLIENT_SECRET=
ENV
  )
}

# ---- commands --------------------------------------------------------------------------------

# nginx needs 80 to answer the ACME challenge and 443 to serve. Something else holding either one
# is the common case on a host that already runs a panel, and installing nginx on top of it only
# produces a bind error several steps later. Naming the occupant here is the whole point.
refuse_if_port_taken() {
  local port occupant
  for port in 80 443; do
    occupant="$(port_owner "$port")" || continue
    # nginx already being there is fine: a second site is another server block, not a second daemon.
    [[ "$occupant" == "nginx" ]] && continue

    err "port $port is already taken by $occupant."
    cat >&2 <<GUIDANCE

  Two things want to terminate TLS on this host and only one can have the port. Either:

    - Put Reel behind whatever is already there. The panel is on port $(env_get REEL_HTTP_PORT || echo 3200);
      point that proxy at 127.0.0.1 on it and skip this command. Then set REEL_BIND=127.0.0.1
      in .env and run ./deploy.sh update, so the port stops being open to the world.

    - Or free $port first, and run this again.

GUIDANCE
    die "nothing was changed."
  done
}

setup_domain() {
  local domain="$1" email="${2:-}"
  [[ -n "$domain" ]] || die "a domain is required: ./deploy.sh domain reel.example.com [you@example.com]"
  [[ -f "$ENV_FILE" ]] || die "no $ENV_FILE yet. Run ./deploy.sh first."

  refuse_if_port_taken
  command -v nginx >/dev/null 2>&1 || install_packages nginx
  # The nginx plugin is a package of its own everywhere, and `certbot --nginx` is inert without it.
  command -v certbot >/dev/null 2>&1 || install_packages certbot python3-certbot-nginx
  as_root systemctl enable --now nginx 2>/dev/null || true

  open_firewall
  check_dns "$domain"

  local port; port="$(env_get REEL_HTTP_PORT)"; port="${port:-3200}"
  write_nginx_site "$domain" "$port"

  # With nginx in front, the container's own port has no business being reachable from anywhere
  # else. This is the step that closes it.
  env_set REEL_DOMAIN "$domain"
  env_set REEL_BIND 127.0.0.1
  log "binding the panel to 127.0.0.1, so only nginx can reach it"
  compose up -d panel

  obtain_certificate "$domain" "$email"
}

setup_spotify() {
  local id="${1:-}" secret="${2:-}"
  [[ -f "$ENV_FILE" ]] || die "no $ENV_FILE yet. Run ./deploy.sh first."
  [[ -n "$id" && -n "$secret" ]] ||
    die "usage: ./deploy.sh spotify <client-id> <client-secret>   (from developer.spotify.com)"

  env_set REEL_SPOTIFY_CLIENT_ID "$id"
  env_set REEL_SPOTIFY_CLIENT_SECRET "$secret"
  compose up -d worker
  log "Spotify playlist reading is on. Metadata only: track lists, never audio."
}

# Asked once, on the first run. A blank answer is a perfectly good answer: plenty of installations
# live on a private network, where a public certificate is neither needed nor issuable.
# REEL_DOMAIN and REEL_ACME_EMAIL answer it ahead of time for an unattended install.
ask_for_domain() {
  DOMAIN="${REEL_DOMAIN:-}"
  ACME_EMAIL="${REEL_ACME_EMAIL:-}"
  [[ -n "$DOMAIN" ]] && return 0
  interactive || return 0

  echo
  echo "  A domain pointed at this server gets nginx and a free Let's Encrypt certificate, set up"
  echo "  now. Leave it blank to serve plain HTTP on port 3200 instead; you can add the domain"
  echo "  later with './deploy.sh domain'."
  echo
  read -rp "  Domain (e.g. reel.example.com), or blank: " DOMAIN
  DOMAIN="${DOMAIN// /}"

  if [[ -n "$DOMAIN" && -z "$ACME_EMAIL" ]]; then
    echo "  An email lets Let's Encrypt warn you before the certificate expires. Optional."
    read -rp "  Email, or blank: " ACME_EMAIL
    ACME_EMAIL="${ACME_EMAIL// /}"
  fi
}

up() {
  install_docker

  local fresh=0 password="" data_root="$DEFAULT_DATA_ROOT"
  DOMAIN=""
  ACME_EMAIL=""

  if [[ -f "$ENV_FILE" ]]; then
    log "keeping the existing $ENV_FILE"
    data_root="$(env_get REEL_DATA_ROOT)"
    data_root="${data_root:-$DEFAULT_DATA_ROOT}"
  else
    fresh=1
    ask_for_domain
    password="${REEL_INITIAL_PASSWORD:-$(random_hex 12)}"
    data_root="${REEL_DATA_ROOT:-$DEFAULT_DATA_ROOT}"
    build_worker_image
    # Bound to localhost from the start when nginx is going in front, so the port is never briefly
    # open to the internet between coming up and being proxied.
    write_env "$password" "$data_root" \
      "$([[ -n "$DOMAIN" ]] && echo 127.0.0.1 || echo 0.0.0.0)" \
      "$DOMAIN"
  fi

  # The panel publishes a host port, and a compose failure to bind one says little about who has
  # it. A run of this on a machine that already hosts something is exactly when that matters.
  local port occupant
  port="$(env_get REEL_HTTP_PORT)"; port="${port:-3200}"
  if occupant="$(port_owner "$port")"; then
    case "$occupant" in
      *euronic-reel*) ;;  # this panel from a previous run; compose replaces it in place
      *) die "port $port is already taken by $occupant. Set REEL_HTTP_PORT in .env to a free one, then run this again." ;;
    esac
  fi

  log "data directory $data_root"
  as_root mkdir -p "$data_root"

  build_fetcher_image
  log "building images"
  compose build --quiet

  log "starting"
  compose up -d --remove-orphans
  wait_for_health

  local secure=0
  if [[ "$fresh" == "1" && -n "$DOMAIN" ]]; then
    setup_domain "$DOMAIN" "$ACME_EMAIL" && secure=1
  fi

  announce "$fresh" "$password" "$secure"
}

announce() {
  local fresh="$1" password="$2" secure="$3"
  local domain port host
  domain="$(env_get REEL_DOMAIN)"
  port="$(env_get REEL_HTTP_PORT)"; port="${port:-3200}"
  host="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"

  echo
  if [[ -n "$domain" ]]; then
    log "Reel is up at $([[ "$secure" == "1" ]] && echo https || echo http)://$domain"
  else
    log "Reel is up at http://${host:-<this-host>}:${port}"
  fi

  [[ "$fresh" == "1" ]] || return 0

  echo
  printf '\033[1;32m  password:\033[0m %s\n' "$password"
  echo "  It is not stored anywhere in readable form. Write it down now."
  echo "  Change it later with: ./deploy.sh password"
  echo

  if [[ -z "$domain" ]]; then
    warn "this is plain HTTP on an open port. Once a domain points here, run"
    warn "  ./deploy.sh domain reel.example.com you@example.com"
    warn "and it will put nginx and a certificate in front and close the port."
  fi
}

wait_for_health() {
  log "waiting for the worker"
  for _ in $(seq 1 60); do
    if compose ps --format '{{.Service}} {{.Health}}' 2>/dev/null | grep -q '^worker healthy'; then
      return 0
    fi
    sleep 1
  done
  warn "the worker did not report healthy in 60s. Its log:"
  compose logs --tail 30 worker >&2 || true
}

set_password() {
  [[ -f "$ENV_FILE" ]] || die "no $ENV_FILE yet. Run ./deploy.sh first."
  local password="${1:-}"
  if [[ -z "$password" ]]; then
    read -rsp "New panel password: " password
    echo
    [[ -n "$password" ]] || die "empty password"
  fi

  build_worker_image
  env_set REEL_PASSWORD_HASH "$(hash_password "$password")"

  log "restarting the worker"
  compose up -d worker
  log "done. The new password works now."
  # Sessions are signed with REEL_SESSION_SECRET, not the password, so a browser that was already
  # signed in stays signed in. Say so rather than let someone assume otherwise.
  log "browsers already signed in stay signed in. Change REEL_SESSION_SECRET too to end those."
}

case "${1:-up}" in
  up|"")           up ;;
  domain)          setup_domain "${2:-}" "${3:-}" ;;
  spotify)         setup_spotify "${2:-}" "${3:-}" ;;
  update)          install_docker; build_fetcher_image; compose build --quiet; compose up -d --remove-orphans; wait_for_health; log "updated" ;;
  update-fetcher)  build_fetcher_image --no-cache; log "yt-dlp is current; the next download uses it" ;;
  password)        set_password "${2:-}" ;;
  status)          compose ps ;;
  logs)            shift; compose logs -f --tail 100 "$@" ;;
  down)            compose down; log "stopped. Downloads and history are untouched." ;;
  *)               die "unknown command '$1'. Try: up, domain, spotify, update, update-fetcher, password, status, logs, down" ;;
esac
