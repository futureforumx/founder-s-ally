#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "=== Removing git lock file ==="
rm -f .git/index.lock

echo "=== Stashing unstaged changes ==="
git stash --include-untracked || true

echo "=== Pulling remote changes ==="
git pull origin main --rebase

echo "=== Popping stash ==="
git stash pop || true

echo "=== Pushing to main ==="
git push origin main

echo ""
echo "✅ Done! Vercel deployment triggered."
read -n 1 -s
