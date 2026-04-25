#!/usr/bin/env bash
# PreToolUse hook: blocks tool calls that would delete files or large swaths of
# code without an explicit removal instruction in the recent conversation.

set -euo pipefail

input=$(cat)

tool_name=$(echo "$input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null || true)
tool_input=$(echo "$input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d.get('tool_input',{})))" 2>/dev/null || true)

block() {
    local reason="$1"
    echo "{\"decision\": \"block\", \"reason\": \"[No-Feature-Deletion Guard] $reason\"}"
    exit 0
}

allow() {
    echo '{"decision": "allow"}'
    exit 0
}

case "$tool_name" in

  Bash)
    command=$(echo "$tool_input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('command',''))" 2>/dev/null || true)

    # Dangerous patterns that remove files or wipe directories
    if echo "$command" | grep -qE '^\s*(rm\s+-[a-zA-Z]*r[a-zA-Z]*\s|rm\s+--recursive|git\s+rm\s+-r|find\s+.*-delete|find\s+.*-exec\s+rm)'; then
      block "Recursive file removal detected ('$command'). If you intentionally want to remove files/directories, please state that explicitly in your request."
    fi

    # git checkout or restore that wipes tracked files
    if echo "$command" | grep -qE 'git\s+(checkout|restore)\s+--\s+\.'; then
      block "Mass file restore/discard detected ('$command'). This would overwrite all local changes. State explicitly if this is intended."
    fi

    # Truncation via redirect into an existing file (echo "" > file)
    if echo "$command" | grep -qE '>\s*\S+\.(ts|tsx|js|jsx|py|go|rs|rb|java|kt|swift|cs|cpp|c|h|php|vue|svelte)(\s|$)'; then
      block "Shell redirect into a source file detected ('$command'). This could truncate existing code. Use the Edit or Write tools instead, which make the change explicit."
    fi
    ;;

  Edit)
    old_string=$(echo "$tool_input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('old_string',''))" 2>/dev/null || true)
    new_string=$(echo "$tool_input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('new_string',''))" 2>/dev/null || true)

    old_lines=$(echo "$old_string" | wc -l)
    new_lines=$(echo "$new_string" | wc -l)

    # Flag edits where the replacement is dramatically shorter (>40 lines removed, <20% retained)
    if [ "$old_lines" -gt 40 ] && [ "$new_lines" -lt $(( old_lines / 5 )) ]; then
      block "This Edit removes ~$((old_lines - new_lines)) lines while retaining only ~$new_lines. Large capability loss detected. Confirm you intended to remove this much code, or use a more targeted edit."
    fi
    ;;

  Write)
    file_path=$(echo "$tool_input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('file_path',''))" 2>/dev/null || true)
    new_content=$(echo "$tool_input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('content',''))" 2>/dev/null || true)

    # Only check source files, not new files or config/data files
    if [[ "$file_path" =~ \.(ts|tsx|js|jsx|py|go|rs|rb|java|kt|swift|cs|cpp|c|h|php|vue|svelte)$ ]]; then
      if [ -f "$file_path" ]; then
        existing_lines=$(wc -l < "$file_path")
        new_lines=$(echo "$new_content" | wc -l)

        # Flag full rewrites that shrink the file by more than 50 lines and 30%
        if [ "$existing_lines" -gt 50 ] && [ "$new_lines" -lt $(( existing_lines * 7 / 10 )) ]; then
          lost=$((existing_lines - new_lines))
          block "Write to '$file_path' would shrink it from $existing_lines to $new_lines lines (~$lost lines lost). This may delete existing features. Confirm the full rewrite is intentional, or use Edit for targeted changes."
        fi
      fi
    fi
    ;;

esac

allow
