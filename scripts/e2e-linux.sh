#!/usr/bin/env bash
# Runs the E2E tests in the Linux browser CI uses, before pushing. Chromium on macOS lays out fonts,
# handles keys (Enter on a select) and times things differently from CI's Ubuntu runner, so a test
# that passes on a Mac can still fail in CI. Here the app is a production build served from this
# machine, with its usual environment and database, and only the browser runs in Linux: the official
# Playwright image of the version in package.json. Arguments go to `playwright test`.
#
# Needs Docker, Postgres from `docker compose up -d --wait` and the demo organization (`pnpm db:migrate`
# and `pnpm db:seed`), like `pnpm test:e2e`.
set -euo pipefail

port="${E2E_PORT:-3100}"
# Signed-in tests write to the database themselves (ADR 0012, amendment of 2026-11-23), so the
# container joins Docker Compose's network, where Postgres is `db`.
network="squadio_default"
version="$(node -p "require('@playwright/test/package.json').version")"
image="mcr.microsoft.com/playwright:v${version}-noble"

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running: start it and try again." >&2
  exit 1
fi
if ! docker network inspect "$network" >/dev/null 2>&1; then
  echo "Postgres is not running: start it with docker compose up -d --wait." >&2
  exit 1
fi

pnpm exec next build

# Call next directly: through pnpm, next-server outlives the script. `next start` still runs the
# server as a child, so it starts in a process group of its own, which the trap stops whole.
# Sign-up off, as the tests expect and production has it until the processing review (ADR 0012).
set -m
SIGN_UP_ENABLED=false node_modules/.bin/next start --port "$port" &
server=$!
set +m
trap 'kill -- "-$server" 2>/dev/null || true' EXIT

for _ in $(seq 60); do
  curl --silent --output /dev/null "http://localhost:${port}" && break
  sleep 1
done
curl --silent --fail --output /dev/null "http://localhost:${port}" || {
  echo "The server did not answer on port ${port}." >&2
  exit 1
}

# The container reaches the host's server as host.docker.internal. The browser must still see
# localhost, as in CI: only there is plain HTTP a secure context, which `crypto.randomUUID` needs.
# So a few lines of Node forward the container's localhost to the host, and its port 5434 to
# Postgres, so the tests use the same database URL as the server, which they still check is local.
# The repository is mounted as it is: Playwright and the tests are plain JavaScript, so this
# machine's node_modules work there.
forward="const net = require('node:net');
const forward = (from, to, host) => net.createServer((client) => {
  const target = net.connect(to, host);
  client.pipe(target).pipe(client);
  client.on('error', () => target.destroy());
  target.on('error', () => client.destroy());
}).listen(from, '127.0.0.1');
forward(${port}, ${port}, 'host.docker.internal');
forward(5434, 5432, 'db');"

# The tests load the server's environment files themselves; exported values win, as on the host.
# Their DATABASE_URL must use port 5434, docker-compose.yml's, the one the container forwards.
docker run --rm --ipc=host \
  --network "$network" \
  --add-host=host.docker.internal:host-gateway \
  --volume "$PWD:/work" --workdir /work \
  --env E2E_BASE_URL="http://localhost:${port}" \
  --env DATABASE_URL --env BETTER_AUTH_SECRET \
  "$image" \
  sh -c 'node -e "$1" & shift; sleep 1; exec node node_modules/@playwright/test/cli.js test "$@"' \
  forward "$forward" "$@"
