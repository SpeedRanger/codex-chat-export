# Codex Chat Export

[![CI](https://github.com/SpeedRanger/codex-chat-export/actions/workflows/ci.yml/badge.svg)](https://github.com/SpeedRanger/codex-chat-export/actions/workflows/ci.yml)
[![CodeQL](https://github.com/SpeedRanger/codex-chat-export/actions/workflows/codeql.yml/badge.svg)](https://github.com/SpeedRanger/codex-chat-export/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://github.com/SpeedRanger/codex-chat-export/actions/workflows/scorecard.yml/badge.svg)](https://github.com/SpeedRanger/codex-chat-export/actions/workflows/scorecard.yml)

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
- persisted Codex events such as task lifecycle, shell command, patch, MCP, web search, rollback, abort, and compaction events
- session metadata
- optional bootstrap context
- schema diagnostics for malformed or unknown rollout lines

## Install

### npm

The package is prepared for npm Trusted Publishing. Until the first npm publish is completed, use the GitHub tarball install below.

After npm publish:

```bash
npx codex-chat-export --last
npm install -g codex-chat-export
cexport --last --bundle ./codex-export --redact --no-raw
```

### GitHub tarball

This is the current public install path before npm is live:

```bash
npm install -g https://github.com/SpeedRanger/codex-chat-export/archive/refs/heads/main.tar.gz
codex-chat-export --last
cexport --last --bundle ./codex-export --redact --no-raw
```

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
codex-chat-export --last --format json --no-raw --output compact-chat.json
codex-chat-export --last --validate
codex-chat-export --list --limit 20
codex-chat-export --match "billing bug" --format json --output billing-session.json
codex-chat-export --id 019d9522-100c-70f3-8a41-6e70be1b917f --include-bootstrap
codex-chat-export --id 019d9522-100c-70f3-8a41-6e70be1b917f --include-internal-events
codex-chat-export --id 019d880a-7e8a-7992-a46a-556fa96d12e5 --include-archived
```

## Options

- `--home PATH`: override Codex home, defaults to `~/.codex`
- `--format md|txt|json`: output format, defaults to `md`
- `--output FILE`: write to a file instead of stdout
- `--bundle DIR`: write `chat.md`, `chat.json`, and `manifest.json` to a directory
- `--redact`: redact common secrets, credential-looking values, and local home/Codex paths
- `--no-raw`: omit `rawRolloutLines` from JSON output and bundles for smaller artifacts
- `--validate`: print rollout schema diagnostics as JSON instead of exporting the chat
- `--last`: export the most recently updated session
- `--current`: export the session referenced by `CODEX_THREAD_ID`
- `--id THREAD_ID`: export a specific session id
- `--match QUERY`: match a session by thread name, preview, cwd, or id substring
- `--list`: list sessions instead of exporting
- `--limit N`: row limit for `--list`
- `--include-archived`: search archived sessions too
- `--include-bootstrap`: include bootstrap developer/system context in Markdown or text output
- `--include-internal-events`: include raw internal reasoning event records in the normalized Markdown/text/JSON timeline

## Design choices

- Rollout JSONL is treated as the source of truth.
- `history.jsonl`, `session_index.jsonl`, and SQLite files are treated as helper metadata only.
- The exporter is read-only and never mutates Codex state.
- Unnamed sessions get a derived title from the first real user turn.
- Commentary-phase assistant messages are deduplicated against `event_msg.agent_message`.
- Known persisted Codex events are rendered as timeline entries instead of being silently dropped.
- Large event payloads are previewed in human exports; full JSON preserves raw rollout lines by default.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full companion-layer decision and phased direction.

For a visual walkthrough of the export artifact, see [docs/SHOWCASE.md](docs/SHOWCASE.md).

For rollout schema drift handling and public fixture guidance, see [docs/SCHEMA_COMPATIBILITY.md](docs/SCHEMA_COMPATIBILITY.md).

For secure npm publishing and launch steps, see [docs/NPM_PUBLISHING.md](docs/NPM_PUBLISHING.md) and [docs/LAUNCH.md](docs/LAUNCH.md).

## Security

- No network access is required to export local chats.
- No telemetry is collected.
- No secrets are embedded in code.
- The tool reads only local Codex state and writes only to stdout or an explicit output path.
- Bootstrap context is excluded from Markdown and text output by default because it may contain large instruction payloads.
- `--include-internal-events` and `--include-bootstrap` may add large sensitive instruction or reasoning payloads.
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
- persisted Codex event rendering
- archived session behavior
- current-thread export via `CODEX_THREAD_ID`
- file output
- bundle output
- opt-in redaction
- compact JSON without raw rollout lines
- malformed JSONL accounting
- rollout schema validation
- public rollout compatibility fixtures
- fixture sanitization for real-world schema samples
- invalid format handling
- bootstrap rendering gates

Run:

```bash
npm test
```

## Benchmarking

Generate a synthetic long Codex rollout and measure common export paths:

```bash
npm run benchmark:large -- --turns 1000
```

Use `--malformed-interval N` to inject corrupt JSONL lines every `N` turns and verify diagnostics under load. Use `--keep` to preserve the generated fixture for inspection.

Current expectation: listing only reads rollout heads, so it should stay fast even with large sessions. Full JSON intentionally carries parsed raw rollout objects and can be large; use `--no-raw` for compact automation artifacts and `--validate` when you only need schema drift diagnostics.

## Fixture Sanitization

Compatibility fixtures must not contain private chat content. To sanitize a local rollout before adding it as a regression fixture:

```bash
npm run fixture:sanitize -- --input /path/to/rollout.jsonl --output test-fixtures/rollouts/new-case/rollout-2026-01-03T00-00-00-01900000-0000-7000-8000-000000000003.jsonl
```

Review sanitized fixtures before committing them. The sanitizer preserves rollout item shape while replacing IDs, timestamps, paths, messages, JSON string payloads, and malformed line text with safe placeholders.

## Product direction

This is designed as a small, sharp utility:

- dead simple CLI surface
- no runtime dependencies
- fast filesystem-first scanning
- clean exports for humans and tooling

## Distribution status

Current launch target:

- public GitHub repository
- GitHub tarball install from repo
- npm Trusted Publishing with provenance

`codex-chat-export` is not published to npm yet. GitHub Actions can build, test, pack, dry-run publish, and sign provenance. The real npm publish is blocked at first-package ownership/permission until the package is claimed by an authenticated npm account.

## License

MIT
