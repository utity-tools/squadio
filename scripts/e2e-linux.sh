#!/usr/bin/env bash
# Runs the E2E tests in the Linux browser CI uses, before pushing. Chromium on macOS lays out fonts,
# handles keys (Enter on a select) and times things differently from CI's Ubuntu runner, so a test
# that passes on a Mac can still fail in CI. Here the app is a production build served from this
# machine, with its usual environment and database, and only the browser runs in Linux: the official
# Playwright image of the version in package.json. Arguments go to `playwright test`.
#
# Needs Docker and the demo organization (`pnpm db:migrate` and `pnpm db:seed`), like `pnpm test:e2e`.
set -euo pipefail

port="${E2E_PORT:-3100}"
version="$(node -p "require('@playwright/test/package.json').version")"
image="mcr.microsoft.com/playwright:v${version}-noble"

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running: start it and try again." >&2
  exit 1
fi

pnpm exec next build

# Call next directly: through pnpm, next-server outlives the script. `next start` still runs the
# server as a child, so it starts in a process group of its own, which the trap stops whole.
set -m
node_modules/.bin/next start --port "$port" &
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
# So a few lines of Node forward the container's localhost to the host. The repository is mounted
# as it is: Playwright and the tests are plain JavaScript, so this machine's node_modules work there.
forward="require('node:net').createServer((client) => {
  const host = require('node:net').connect(${port}, 'host.docker.internal');
  client.pipe(host).pipe(client);
  client.on('error', () => host.destroy());
  host.on('error', () => client.destroy());
}).listen(${port}, '127.0.0.1')"

docker run --rm --ipc=host \
  --add-host=host.docker.internal:host-gateway \
  --volume "$PWD:/work" --workdir /work \
  --env E2E_BASE_URL="http://localhost:${port}" \
  "$image" \
  sh -c 'node -e "$1" & shift; sleep 1; exec node node_modules/@playwright/test/cli.js test "$@"' \
  forward "$forward" "$@"
