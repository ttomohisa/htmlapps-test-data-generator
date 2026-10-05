# JSON preview copy and literal column keys

**Goal:** Copy the first N of M generated rows as complete JSON, while preserving every legal column name in preview and exports.
**Architecture:** Serialize the existing immutable preview snapshot, bound copy text at 1 MiB UTF-8, and use only the modern clipboard API after a click. Reuse native dialog styling for manual selection and guard asynchronous copy results by generation and copy token. Worker row/metadata dictionaries use literal own keys; rendering checks own metadata after structured clone.
**Tech stack:** Existing single HTML, native browser APIs, dependency-free Node regression harness, PowerShell release build.
**Spec:** APP_SPEC.md and the approved preview-copy design.

## Constraints and review focus
- At most 20 rows, no value truncation, no metadata in JSON, preserve numbers/nulls and exact keys.
- Preserve ordinary seeded CSV/TSV/JSON/JSONL bytes, PRNG call order, full-export behavior, filenames, snapshots, cancellation and runtime CSP.
- Clipboard unavailable/denied must yield selectable read-only JSON with close/Escape/backdrop dismissal and focus restoration.
- Edits, reset, replacement, regeneration, export, and pagehide invalidate pending copy UI; late completion cannot claim current success.
- A Unicode-heavy value must be checked by UTF-8 bytes, and over-limit JSON must never be copied partially.
- Special names `__proto__`, `constructor`, `toString`, and `hasOwnProperty` must survive worker structured clone, normal/missing/boundary/invalid modes, preview, and all formats.
- Japanese/English help and controls, generated artifact parity, no dependencies, no browser or production mutations in this task.

## Tasks
- [x] Add red behavior tests and worker structured-clone semantics; record ordinary seeded format hashes from upstream main.
- [x] Fix own-key maps and metadata rendering, then run red-to-green regression checks.
- [x] Add bounded explicit JSON copy, localized status, and accessible manual fallback; verify disabled, repeated, canceled, stale, and lifecycle paths.
- [x] Update spec, READMEs, help and changelog; rebuild and test source, readable, root and self-extract variants.
- [x] Get independent review. No blocking findings; 77/77 source tests and upstream byte hashes independently verified.
- [ ] Publish an English draft PR; verify remote exact-head CI and keep merge under user control.
