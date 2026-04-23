# Schema Compatibility

Codex Chat Export reads rollout JSONL as its source of truth. That keeps exports high-fidelity, but it also means upstream Codex rollout shape drift is the main long-term correctness risk.

## Guardrails

- `codex-chat-export --last --validate` prints observed rollout shapes and unknown shape diagnostics.
- Tests load public sanitized fixtures from `test-fixtures/rollouts`.
- Full JSON exports preserve malformed JSONL line text so corrupt input is visible instead of silently dropped.
- Markdown exports add a Schema Diagnostics section only when malformed or unknown shapes are detected.

## Adding Fixtures

Use synthetic fixtures when possible. For real-world compatibility bugs, sanitize the source rollout before committing it:

```bash
node scripts/sanitize-rollout-fixture.mjs --input /path/to/rollout.jsonl --output test-fixtures/rollouts/<case>/rollout-YYYY-MM-DDTHH-MM-SS-01900000-0000-7000-8000-000000000123.jsonl
```

You can also use the latest local Codex session:

```bash
node scripts/sanitize-rollout-fixture.mjs --last --output test-fixtures/rollouts/current-local/rollout-2026-01-03T00-00-00-01900000-0000-7000-8000-000000000003.jsonl
```

Review generated fixtures before committing. The sanitizer replaces message text, paths, IDs, timestamps, tool outputs, and JSON string payloads with deterministic placeholders while preserving field names and rollout item types.

## Known Limit

The public fixture set is compatibility coverage, not a complete archive of Codex internals. Keep issue `#5` open until fixtures have been collected from multiple Codex CLI versions.
