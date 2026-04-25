---
name: no-feature-deletion
description: Prevents accidental deletion of features and capabilities. Invoke this skill when reviewing code changes, refactoring, or any task where existing functionality could be unintentionally removed. Also triggers automatically via PreToolUse hook.
---

# No-Feature-Deletion Guard

This skill ensures that no existing features, capabilities, endpoints, UI components, configuration options, or behaviors are removed unless the user has **explicitly and unambiguously** instructed you to do so.

## Core Rule

**Never remove a feature or capability as a side effect of another task.** If a task requires touching code that implements an existing feature, preserve that feature unless removal was specifically requested.

## What Counts as a Feature or Capability

- API endpoints or routes
- UI components, pages, or interactive controls
- Configuration options or environment variable support
- CLI flags, commands, or arguments
- Database models, fields, or relationships
- Exported functions, classes, or types (public API surface)
- Authentication/authorization flows
- Integrations with third-party services
- Event handlers, webhooks, or callbacks
- Background jobs, cron tasks, or queue processors
- Error handling paths or fallback behaviors
- Accessibility features (ARIA, keyboard navigation)
- Internationalization / localization support
- Test coverage for existing behaviors

## Workflow

When executing ANY task that modifies existing files, follow these steps:

### 1. Inventory Existing Features

Before making changes, scan the files you will touch and list:
- What public functions/classes/routes exist?
- What behaviors does this code implement?
- What does the current code handle that the task does NOT mention?

### 2. Map Task Scope

Identify exactly what the user asked to change. Anything outside that scope must be preserved.

### 3. Check Every Deletion

For every line or block you plan to remove, ask:
- Was I explicitly told to remove this?
- Is this dead code that was already unreachable BEFORE my changes?
- Is this a genuine refactor where the behavior is preserved in a new form?

If the answer to all three is **no**, do not remove it.

### 4. Flag Conflicts

If completing the requested task cleanly requires removing something you weren't told to remove, **stop and ask the user** before proceeding:

> "To implement X, I would need to remove [feature/function/behavior]. This wasn't mentioned in your request — should I remove it, or find a way to preserve it?"

### 5. Final Check Before Committing

After drafting all changes, do a diff review:
- Look at every `-` line (removal) in the diff
- Confirm each removal is either explicitly requested or is dead code
- If anything looks like an unintended capability loss, revert it or ask

## Explicit Instruction Examples

These are examples of instructions that DO authorize removal:

- "Remove the `/admin` route"
- "Delete the dark mode toggle"
- "Drop the `legacyAuth` option, we don't need it"
- "Clean up the old v1 API endpoints"
- "Simplify this — remove the retry logic"

These are examples that do NOT authorize removal:

- "Refactor this file" — refactoring preserves behavior
- "Make this cleaner" — aesthetic improvement, not feature removal
- "Fix this bug" — fix only, don't remove unrelated code
- "Add a new feature" — additions only
- "Rewrite this function" — rewrite must preserve existing behavior

## When in Doubt

Ask. A one-sentence clarification question is far cheaper than accidentally deleting functionality that users depend on.

Always prefer a targeted change that adds or modifies over a wholesale replacement that might silently drop features.
