# Codex Chat Export

`codex-chat-export` turns local Codex CLI rollout history into clean, portable exports.

It reads Codex session rollouts directly from `~/.codex/sessions` and `~/.codex/archived_sessions`, then emits:

- readable Markdown for sharing
- plain text for lightweight copying
- JSON for full-fidelity tooling and automation
- export bundles with Markdown, JSON, and manifest files
- optional redaction for common secrets and local paths

## Why this exists

Codex stores the real session timeline in rollout JSONL. That data is richer than what you can reliably copy from a terminal transcript.

This tool exports:

- user messages
- assistant messages
- commentary updates
- reasoning summaries
- tool calls
- tool outputs
- session metadata
- optional bootstrap context

## Install

### Run locally

```bash
git clone https://github.com/SpeedRanger/codex-chat-export.git
cd codex-chat-export
npm test
node scripts/codex-chat-export.mjs --last
```

### Use directly from the repo

```bash
node scripts/codex-chat-export.mjs --last
```

## Usage

```bash
codex-chat-export --last
codex-chat-export --current --format md --output current-chat.md
codex-chat-export --last --bundle ./codex-chat-export
codex-chat-export --last --bundle ./shareable-chat --redact
codex-chat-export --list --limit 20
codex-chat-export --match "billing bug" --format json --output billing-session.json
codex-chat-export --id 019d9522-100c-70f3-8a41-6e70be1b917f --include-bootstrap
codex-chat-export --id 019d880a-7e8a-7992-a46a-556fa96d12e5 --include-archived
```

## Options

- `--home PATH`: override Codex home, defaults to `~/.codex`
- `--format md|txt|json`: output format, defaults to `md`
- `--output FILE`: write to a file instead of stdout
- `--bundle DIR`: write `chat.md`, `chat.json`, and `manifest.json` to a directory
- `--redact`: redact common secrets, credential-looking values, and local home/Codex paths
- `--last`: export the most recently updated session
- `--current`: export the session referenced by `CODEX_THREAD_ID`
- `--id THREAD_ID`: export a specific session id
- `--match QUERY`: match a session by thread name, preview, cwd, or id substring
- `--list`: list sessions instead of exporting
- `--limit N`: row limit for `--list`
- `--include-archived`: search archived sessions too
- `--include-bootstrap`: include bootstrap developer/system context in Markdown or text output

## Design choices

- Rollout JSONL is treated as the source of truth.
- `history.jsonl`, `session_index.jsonl`, and SQLite files are treated as helper metadata only.
- The exporter is read-only and never mutates Codex state.
- Unnamed sessions get a derived title from the first real user turn.
- Commentary-phase assistant messages are deduplicated against `event_msg.agent_message`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full companion-layer decision and phased direction.

## Security

- No network access is required to export local chats.
- No telemetry is collected.
- No secrets are embedded in code.
- The tool reads only local Codex state and writes only to stdout or an explicit output path.
- Bootstrap context is excluded from Markdown and text output by default because it may contain large instruction payloads.
- `--redact` is available for shareable exports, but it is a best-effort safety layer, not a substitute for reviewing sensitive chats.

See [SECURITY.md](SECURITY.md) for disclosure guidance and operational notes.

## Free and optional support

This tool is free. There are no paid tiers, telemetry, locked export formats, or gated features.

If it saves you time, the best support right now is to star the repo, share it with other Codex users, and open clear issues when something breaks. A lightweight maintainer support link will be added once configured.

## Testing

The test suite covers:

- rollout filename parsing
- bootstrap vs real user turn classification
- session listing and title derivation
- fuzzy matching
- structured tool payload rendering
- archived session behavior
- current-thread export via `CODEX_THREAD_ID`
- file output
- bundle output
- opt-in redaction
- invalid format handling
- bootstrap rendering gates

Run:

```bash
npm test
```

## Product direction

This is designed as a small, sharp utility:

- dead simple CLI surface
- no runtime dependencies
- fast filesystem-first scanning
- clean exports for humans and tooling

## Distribution status

Current launch target:

- public GitHub repository
- tagged GitHub release
- source install from repo

`codex-chat-export` is not published to npm yet.

## License

MIT
