#!/bin/bash
cd "$(dirname "$0")"
echo "Pushing fix to GitHub..."
git push origin HEAD
echo ""
echo "Done. Press any key to close..."
read -n 1
