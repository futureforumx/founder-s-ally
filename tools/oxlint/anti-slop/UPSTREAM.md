# Vendored anti-slop

Source: [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop).

- Incoming revision: `13909c9e07590f5a85d93c62712259fe14a883f7` (2026-10-13). The files in this directory match that commit's `skills/install-anti-slop/assets/anti-slop`, including `vendor/eslint-stylistic/LICENSE` and its own `UPSTREAM.md`.
- Base revision: `6d538555cb151d4121ed51a27db81890eacf8ae9` (2026-08-18). The previous tree matched that commit's skill assets with no local edits, so the update applied the incoming snapshot.

Installed paths:

- Generic plugin: `tools/oxlint/anti-slop/index.ts`, registered as `anti-slop`.
- Effect plugin: `tools/oxlint/anti-slop/effect/index.ts`, vendored and not registered.

## Adopted

The full incoming skill-asset snapshot, including the new generic rules `no-array-filter-map`, `no-reduce-accumulator-copy`, and `require-readable-spacing`, plus the updated Effect rule sources. Existing generic rules stay at `"error"`. The native companion `oxc/no-accumulating-spread` is enabled at `"error"`.

## Intentional deviations

- The Effect plugin is not registered. This repository does not depend on `effect`, and the previous config did not opt in.
- `oxlint` and `@oxlint/plugins` stay at `1.80.0`. Upstream's package pins `1.78.0`. Both packages here were already an exact pair.
- Ignore patterns keep this repository's existing entries (`.aidesigner/**`, `.playwright-mcp/**`, `dist/**`, `playwright-report/**`, `founder-intel/packages/database/generated/**`) along with the agent-tooling ignores.

## Verification

- Upstream RuleTester suites for the generic and Effect rules passed under this repository's `oxlint` 1.80.0. The rule sources match upstream `src` at the incoming revision; tests were run from that checkout and are not vendored here.
- A fixture lint accepted iterator `filter`/`map` pipelines and in-place reducers, and rejected array `filter`/`map` chains, `Object.assign({}, acc, …)` reducers, accumulating spreads, and missing blank lines.
- `oxlint .` reports existing application findings. They were left in place. `pnpm exec eslint .` reports 1198 existing errors and 136 warnings, none in this plugin. `tsc -p tsconfig.app.json` and `tsc -p tsconfig.node.json` still fail on existing application errors; none are in this plugin or `oxlint.config.ts`.
