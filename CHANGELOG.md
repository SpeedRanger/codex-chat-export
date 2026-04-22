# Changelog

## 0.4.2

- Add public showcase documentation and output model visual.
- Add `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`.
- Add OpenSSF Scorecard workflow.
- Run `npm audit --audit-level=moderate` in CI.
- Add README badges for CI, CodeQL, and Scorecard.

## 0.4.1

- Add `npm run benchmark:large` for repeatable synthetic long-rollout benchmarking.

## 0.4.0

- Add `--no-raw` to omit `rawRolloutLines` from JSON and bundle exports.
- Preserve normalized entries, metadata, and raw line counts while producing smaller structured artifacts.
- Update bundle manifest descriptions when compact JSON is used.
- Expand test coverage to 23 tests.

## 0.3.0

- Add `--redact` for opt-in best-effort redaction across Markdown, text, JSON, and bundle exports.
- Redact common token patterns, credential-looking key-value fields, credential-bearing URLs, and local home/Codex paths.
- Add redaction metadata to JSON exports and bundle manifests.
- Expand test coverage to 21 tests.
- Document redaction behavior in README, SECURITY, and architecture docs.

## 0.2.0

- Add `--bundle DIR` to write `chat.md`, `chat.json`, and `manifest.json` together.
- Add `cexport` as a shorter binary alias.
- Include architecture docs in the package tarball.
- Expand test coverage to 17 tests.

## 0.1.0

- Initial public release.
- Export Codex rollout JSONL into Markdown, text, and JSON.
- Support `--last`, `--current`, `--id`, `--match`, `--list`, and archived sessions.
- Keep exporter read-only against Codex state.
