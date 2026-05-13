# Schema Compatibility

Codex Chat Export reads rollout JSONL as its source of truth. That keeps exports high-fidelity, but it also means upstream Codex rollout shape drift is the main long-term correctness risk.

## Guardrails

- `codex-chat-export --last --validate` prints observed rollout shapes and unknown shape diagnostics.
- Tests load public sanitized fixtures from `test-fixtures/rollouts`.
- Full JSON exports preserve malformed JSONL line text so corrupt input is visible instead of silently dropped.
- Markdown exports add a Schema Diagnostics section only when malformed or unknown shapes are detected.
- Known persisted Codex operational events are rendered into the normalized timeline instead of being treated as raw-only data.
- Raw internal reasoning events are opt-in with `--include-internal-events` so default Markdown remains readable.
- Large event payloads such as shell stdout, MCP results, patch content, and final task messages are previewed in Markdown/text; full JSON with raw rollout lines remains the archival path.

## Rendered Event Coverage

The human-readable timeline currently renders these events by default:

- `agent_message`
- `context_compacted`
- `exec_command_begin`
- `exec_command_end`
- `mcp_tool_call_begin`
- `mcp_tool_call_end`
- `patch_apply_begin`
- `patch_apply_end`
- `task_complete`
- `task_started`
- `thread_rolled_back`
- `turn_aborted`
- `web_search_begin`
- `web_search_end`

`agent_reasoning` and `agent_reasoning_raw_content` are rendered only when `--include-internal-events` is set.

`user_message` and `token_count` are handled specially: user turns are normalized from paired user message records, and token counts are summarized in thread metadata.

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
