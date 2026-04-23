# Rollout Compatibility Fixtures

These fixtures are intentionally synthetic or sanitized. They preserve Codex rollout JSONL shape without containing private chat content.

- `legacy-basic`: minimal message, user event, assistant response, and token count shape.
- `current-schema-shapes`: broad current Codex event and response item shape coverage.

When adding a fixture from a real local rollout, generate it with:

```bash
node scripts/sanitize-rollout-fixture.mjs --input /path/to/rollout.jsonl --output test-fixtures/rollouts/<case>/rollout-YYYY-MM-DDTHH-MM-SS-01900000-0000-7000-8000-000000000123.jsonl
```

Review generated fixtures before committing. The sanitizer preserves schema shape, not semantic chat content.
