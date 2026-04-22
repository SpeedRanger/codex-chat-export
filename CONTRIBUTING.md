# Contributing

Thanks for helping improve `codex-chat-export`.

## Development Setup

```bash
git clone https://github.com/SpeedRanger/codex-chat-export.git
cd codex-chat-export
npm install
npm test
```

## Local Checks

Run before opening a pull request:

```bash
npm test
npm run benchmark:large -- --turns 100
```

## Product Rules

- Keep the exporter read-only against Codex state.
- Do not add telemetry.
- Do not add network calls to the exporter path.
- Do not gate core export features behind payment.
- Treat chat exports as sensitive by default.

## Fixtures

Prefer synthetic fixtures in tests. Do not commit real Codex chats, local rollout files, API keys, auth data, or private workspace paths.

If a real rollout shape exposes a bug, create the smallest redacted fixture that reproduces the issue.

## Release Notes

Update `CHANGELOG.md` for user-visible changes.
