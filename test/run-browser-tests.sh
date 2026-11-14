#!/bin/bash
# Run the jQuery QUnit browser suite (test/index.html) headlessly against the
# freshly built dist/. Upstream ran this suite in real browsers via TestSwarm;
# Travis only ran `grunt` (lint + build). test/data/*.php fixtures are served by
# PHP's built-in web server; the runner needs a modern Node for puppeteer,
# installed side by side via nvm so the project's own Node 0.10 build is untouched.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Several workers: test/data/core/dont_return.php sleeps 30s on purpose, which
# would stall a single-threaded server and every request queued behind it.
PHP_CLI_SERVER_WORKERS=8 php -S 127.0.0.1:8000 -t "$ROOT" > /tmp/php-server.log 2>&1 &
PHP_PID=$!
trap 'kill $PHP_PID 2>/dev/null || true' EXIT
sleep 2

set +u
source "$HOME/.nvm/nvm.sh"
nvm install 18 > /dev/null
nvm use 18 > /dev/null
set -u

RUNNER_DIR=/tmp/qunit-runner
mkdir -p "$RUNNER_DIR"
cp "$ROOT/test/run-browser-tests.cjs" "$RUNNER_DIR/"
( cd "$RUNNER_DIR" && npm install --no-audit --no-fund --registry=https://registry.npmjs.org/ puppeteer@22.15.0 > /dev/null )

node "$RUNNER_DIR/run-browser-tests.cjs" "http://127.0.0.1:8000/test/index.html"
