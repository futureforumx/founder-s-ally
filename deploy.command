#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "=== Removing git lock file ==="
rm -f .git/index.lock

echo "=== Staging all changes ==="
git add -A

echo "=== Committing ==="
git diff --cached --quiet && echo "Nothing to commit, skipping." || git commit -m "fix(onboarding): clear social URLs on mount; rename label to Personal Social Profiles

- LinkedIn and X inputs now always start empty (never auto-populate from
  previous sessions stored in localStorage)
- Clear linkedinUrl/twitterUrl from onboarding state on Step 1 mount
- Rename section label from 'Social Profiles' to 'Personal Social Profiles'"

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
