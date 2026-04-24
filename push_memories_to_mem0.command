#!/bin/bash
cd "$(dirname "$0")"
echo "Installing mem0ai if needed..."
pip3 install mem0ai --break-system-packages -q 2>/dev/null || pip install mem0ai -q 2>/dev/null
echo "Running memory push..."
python3 push_memories_to_mem0.py
echo ""
echo "Press any key to close..."
read -n 1
