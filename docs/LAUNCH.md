# Launch Plan

Codex Chat Export is free. No paid tiers, telemetry, or locked formats.

## Current Position

- GitHub repo: https://github.com/SpeedRanger/codex-chat-export
- Latest released tag: `v0.6.0`
- Next prepared release: `v0.8.0`
- Current public install path: GitHub tarball install from `main`
- npm package name: `codex-chat-export`
- Distribution blocker: first npm publish needs authenticated package ownership/permission before Trusted Publishing can become the steady-state path

## Launch Checklist

- [x] Public GitHub repository
- [x] MIT license
- [x] Security policy
- [x] CI on Windows and Linux
- [x] CodeQL
- [x] OpenSSF Scorecard
- [x] Release tarballs
- [x] Redaction mode
- [x] Schema validation
- [x] Sanitized fixture infrastructure
- [x] Rich persisted event timeline rendering
- [x] GitHub tarball install smoke test
- [x] Remote npm publish dry run
- [x] Remote real publish attempt isolated npm ownership blocker
- [ ] npm Trusted Publishing configured
- [ ] First npm publish
- [ ] README updated with live npm install badge
- [ ] Support link configured
- [ ] Short demo GIF or terminal recording
- [ ] Launch post

## Launch Message

Codex Chat Export exports full local Codex CLI chats from rollout JSONL into clean Markdown, text, JSON, or a shareable bundle.

It is read-only, local-first, has optional redaction, and includes schema diagnostics for Codex rollout drift.

Example:

```bash
npm install -g https://github.com/SpeedRanger/codex-chat-export/archive/refs/heads/main.tar.gz
cexport --last --bundle ./codex-export --redact --no-raw
```

## Support Link

Do not add a fake support URL. Add `.github/FUNDING.yml` only after a real Buy Me a Coffee, GitHub Sponsors, Ko-fi, or similar account exists.
