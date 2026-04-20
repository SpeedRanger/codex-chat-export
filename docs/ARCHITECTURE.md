# Architecture

## Core Decision

`codex-chat-export` is a layer on top of Codex CLI, not a fork or patch of Codex CLI.

That is the right first move because chat export is mostly a read-and-format problem, not a runtime behavior problem. Codex already writes the source-of-truth data to local rollout files under `~/.codex/sessions/...`. A companion tool can read those files, resolve a session, and export it cleanly without changing Codex itself.

## Initial Shape

The recommended product shape is:

1. Build a separate companion command: `codex-chat-export`.
2. Keep it read-only.
3. Export from rollout JSONL, not terminal screen output.
4. Support Markdown, text, and JSON.
5. Support recent, explicit, and fuzzy session selection: `--last`, `--current`, `--id`, `--match`, and `--list`.

## Why This Shape

Advantages:

- Lower risk: no chance of breaking Codex resume, history, or TUI behavior.
- Faster iteration: export formatting can evolve without waiting on Codex internals.
- Easier local maintenance: one small tool with one job.
- Easier proof of value: if the tool earns usage, it can later inform native integration.

Tradeoffs:

- Worse discoverability than a native `codex export`.
- Session resolution can drift if Codex changes rollout internals.
- No native in-session `/export` UX unless a wrapper or upstream integration is added later.

## Phased Direction

Phase 1: external exporter only.

Phase 2: if it feels useful, add a thinner convenience path such as:

- `cexport --last`
- `cexport <session-id>`
- `cexport --current`

Phase 3: only after the standalone tool proves itself, decide whether it deserves:

- an upstream Codex PR
- a local Codex wrapper
- native `/export` integration

## Export Artifact Model

Avoid thinking of export as only one Markdown file.

The clean long-term model is an export bundle:

- `chat.md` for human reading
- `chat.json` for full fidelity
- `manifest.json` for metadata
- optional `assets/` later for images and files

The CLI supports this with `--bundle DIR`. Single-file exports remain the fastest path for copying or scripting, while bundle mode is the richer artifact for archiving, sharing with collaborators, or feeding downstream tools.

`--no-raw` can be used with JSON or bundle exports to omit `rawRolloutLines`. This keeps the normalized timeline, metadata, and stats while producing smaller artifacts for sharing or automation.

## Redaction Model

Redaction is an opt-in export transform.

The exporter first builds the normal structured export document from rollout JSONL, then `--redact` applies a recursive redaction pass before Markdown, text, JSON, or bundle files are rendered.

This keeps the core parser read-only and deterministic while making the same safety behavior available across every output mode.

Current redaction targets:

- common API key and token patterns
- credential-looking key-value fields such as `api_key`, `token`, `secret`, and `password`
- credential-bearing URLs
- local home and Codex home paths

Redaction is intentionally documented as best-effort. It reduces accidental disclosure but does not replace human review before sharing an export publicly.

## Source Of Truth

Rollout JSONL files are the canonical source.

Helper files such as `history.jsonl`, `session_index.jsonl`, and SQLite state can improve names, previews, or discovery, but they should not become the canonical transcript source.

This matters because terminal screen state and UI transcript views can omit, duplicate, or summarize information. Rollouts preserve the richer event timeline needed for a proper export.

## Safety Rule

The exporter must remain read-only with respect to Codex state.

It may scan and parse Codex files. It must not repair, rewrite, normalize, compact, or mutate:

- `~/.codex/sessions`
- `~/.codex/archived_sessions`
- `~/.codex/history.jsonl`
- `~/.codex/session_index.jsonl`
- `~/.codex/state_*.sqlite`

If repair or indexing features are ever added, they should live behind a separate explicit command and a separate design review.
