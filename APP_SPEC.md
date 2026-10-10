# APP_SPEC.md — Test Data Generator

## 1. Product identity

- **Name:** Test Data Generator / テストデータ生成
- **Repository:** `ttomohisa/htmlapps-test-data-generator`
- **Current version:** `1.0.2`
- **Purpose:** Generate reproducible test data locally in the browser, including normal, missing, boundary, and invalid values.
- **Release artifacts:** `dist/index.html` and `dist/index.self-extract.html`

## 2. v1.0.0 scope

v1.0.0 is the first stable release. It formalizes the feature set validated in the v0.9.0 release candidate: all 23 data types, seven templates, deterministic Seed output, test-value mixes, settings-file portability, large-data generation / cancellation, CSV / TSV / JSON / JSONL export, bilingual UI, responsive layout, CSP, and standalone / self-extract artifacts. No generated-data semantics are intentionally changed from v0.9.0.

### Included

- All 23 existing basic and Japanese data types.
- Deterministic Seed generation using `xmur3-mulberry32-v1`.
- Normal / Light test / Stricter test presets and per-column Missing %, Boundary %, and Invalid % controls.
- Seven built-in dataset templates: User, Customer, Employee, Product, Order, Inquiry, and Access log.
- Add, duplicate, delete with Undo, and reorder column actions.
- Existing CSV / TSV / JSON / JSONL export and `test-data-schema.json` settings portability.
- Web Worker generation and export with progress and cancellation.
- 1–1,000,000 rows with the existing 10,000,000-cell (`rows × columns`) guardrail.
- Preview of the first 20 rows while full export is deterministically regenerated from the same snapshot.
- The v0.8.2 desktop control alignment, compact Template Apply button, and Save-panel alignment fixes.
- Japanese / English desktop and smartphone UI.

### Explicitly not in v1.0.0

- Cross-column relationships such as matching name and email or prefecture and city.
- Relational multi-table generation or foreign-key consistency.
- User-defined templates or template persistence separate from the existing settings-file feature.
- JSON Schema, OpenAPI, SQL schema, regular-expression, or expression-based generation.

## 3. Built-in templates

Templates replace only the column schema. Current row count and Seed are preserved.

| Template | Columns |
| --- | --- |
| User | `id`, `name`, `email`, `phone`, `prefecture`, `created_at` |
| Customer | `customer_id`, `name`, `email`, `phone`, `postal_code`, `address`, `registered_at` |
| Employee | `employee_id`, `name`, `email`, `department`, `joined_at`, `status` |
| Product | `product_id`, `name`, `price`, `stock`, `category`, `created_at` |
| Order | `order_id`, `customer_id`, `product_id`, `quantity`, `price`, `status`, `ordered_at` |
| Inquiry | `id`, `name`, `email`, `category`, `message`, `created_at` |
| Access log | `timestamp`, `ip`, `method`, `path`, `status` |

Template choice-list values are embedded test fixtures. They do not represent external or current production data.

When current columns exist, template application uses the standard confirmation dialog and states that the current columns and generated preview will be replaced / cleared. No template silently overwrites existing work.

## 4. Column operations

Each column supports:

- move up,
- move down,
- duplicate,
- delete.

Delete remains undoable through the standard toast action. Duplicate creates a unique name such as `email_copy`, `email_copy_2`, and keeps the source type, type settings, and test-value rates.

A maximum of 200 imported / interactive columns is retained as the practical schema guardrail.

## 5. Empty and completion states

- With zero columns, the regular column list is replaced by an explicit empty state explaining what to do next and an Add column button.
- Before generation, preview states explain that Generate data is the next action.
- After generation, preview count, test-value aggregate counts, Seed used, and format-aware save status remain visible.
- Generated data is invalidated when schema, Seed, test mix, or template changes.

## 6. Test-value behavior

Presets remain unchanged from v0.6.0:

| Preset | Missing | Boundary | Invalid |
| --- | ---: | ---: | ---: |
| Normal | 0% | 0% | 0% |
| Light test | 2% | 5% | 1% |
| Stricter test | 10% | 15% | 10% |

Boundary percentage is automatically 0 for types without a meaningful boundary definition. Missing values serialize as `null` in JSON / JSONL and as empty cells in CSV / TSV. Preview-only Missing / Boundary / Invalid badges are never added to exported schemas.

## 7. Seed and reproducibility

- Seed is a text value up to 128 characters.
- The Seed input placeholder is `42`.
- Blank Seed values are replaced with a locally generated Seed at generation time.
- Dataset randomness uses only `xmur3-mulberry32-v1` after Seed selection.
- Identical row count, columns, type settings, test settings, and Seed reproduce byte-equivalent serialized data.
- Template application does not change Seed or row count.

## 8. Settings-file compatibility

The settings file remains `version: 1` with `generator: "xmur3-mulberry32-v1"`.

v1.0.0 does not introduce a new schema-file field for templates: after a template is applied, the resulting ordinary column settings are saved. This keeps the file self-contained and compatible with the v0.6.0 reader behavior.

## 9. Large-data processing

- Rows are limited to 1,000,000.
- `rows × columns` is limited to 10,000,000 cells to avoid unsafe schemas such as 1,000,000 rows × 200 columns.
- Generation runs in a Blob-backed Web Worker allowed by the existing `worker-src 'self' blob:` CSP.
- The worker traverses every requested row but only posts the first 20 rows and aggregate test-value counts back to the page.
- The page stores an immutable generation snapshot (row count, Seed, columns, settings, and test rates).
- Export starts a new Worker and regenerates from that snapshot, preserving deterministic output while avoiding a full in-page row array.
- CSV / TSV / JSON / JSONL text is posted back in bounded chunks and assembled as a Blob for download.
- Generation and export each expose progress and a cancel action. Cancellation terminates the active Worker and discards incomplete output.

## 10. Security and privacy

- Generation, template application, preview, serialization, and file creation remain local to the browser.
- No runtime CDN, analytics, telemetry, geocoding, postal API, or generation API is used.
- Generated HTML-like strings are inserted through text APIs, never executable markup.
- Browser local storage may contain language, schema settings, Seed, test rates, and export preferences.
- Generated rows are not persisted automatically.
- CSP keeps `connect-src 'none'`.

## 11. Acceptance criteria

- `app.config.json` and visible build information report `1.0.2`.
- Header language switching shows the target language as `EN` in Japanese and `JA` in English, with localized aria-label/title (`英語に切り替え` / `Switch to Japanese`). The visible `vX.Y.Z` badge matches `app.config.json`; privacy remains `完全ローカル処理` / `Fully local processing`.
- Seed placeholder remains `42`.
- All 23 data types generate successfully in one schema.
- Normal / Light test / Stricter test mixes remain deterministic and strict mix produces missing / boundary / invalid data.
- All seven templates apply the documented column names and generate successfully with a fixed Seed.
- Template cancellation leaves the current schema untouched.
- Duplicate, delete Undo, reorder, reset, and empty-state Add column have no regression.
- Same settings and Seed produce byte-identical output; changing Seed changes generated output.
- Settings-file save / load restores row count, Seed, and column schema.
- CSV / TSV / JSON / JSONL files are created and parse / escape as appropriate.
- CSV UTF-8 BOM and LF / CRLF options behave as selected.
- 100,000-row generation and CSV export complete.
- 1,000,000-row generation completes for a schema under the cell guardrail.
- 10,000,000-cell guardrail rejects oversized generation requests.
- Generation and export cancellation both complete cleanly.
- Desktop column controls keep a common first-control baseline; Save fields remain aligned; Template Apply remains compact.
- 320 / 360 / 390 px smartphone layouts have no page-level horizontal scroll.
- Japanese / English UI and help dialog remain usable.
- Runtime CSP contains `connect-src 'none'`; no runtime external HTTP / HTTPS request is introduced.
- `dist/index.html` contains no unresolved template placeholders or runtime external dependency tags.
- Self-extract payload restores byte-for-byte to the readable standalone HTML.

## 12. Post-1.0 candidates

The following remain future candidates rather than v1.0.0 requirements:

- Cross-column relationships such as name → email and prefecture → city.
- JSON Schema / OpenAPI / SQL schema import.
- SQL INSERT and additional output formats.
- Multi-table generation and foreign-key consistency.
- User-defined templates and advanced expression / pattern generators.

## 13. Editing and save reliability

- Required numeric type settings reject blank or whitespace-only values before numeric conversion. Explicit zero remains valid wherever the existing range permits it. Invalid values stay editable and corrected values generate normally.
- Column name and type controls have localized accessible names at desktop and narrow widths. Re-rendering preserves the focused column/control and text selection. Moving to an edge focuses the reverse move action; deletion focuses the next column name, or the previous one at the end. Deleting the last column focuses Add column. Undo focuses the restored name.
- Editing schema, row count or Seed cancels pending generation/export and invalidates the previous result. Reset, settings-file replacement and templates reject late completions from the replaced worker.
- Export names remove path separators/control characters, replace any trailing known CSV/TSV/JSON/JSONL extensions with the selected extension, and use `test-data` when no base remains. Other meaningful suffixes such as `.v2` are retained.
- The normal build regenerates the root `test-data-generator.html` from exactly the readable artifact bytes. A custom output build does not rewrite this release alias.
- Dependency-free Node.js tests exercise the actual inline application and worker on source, readable, self-extract and root artifacts using only tiny synthetic datasets. Browser verification remains necessary for rendering, native keyboard and real downloads.

## 14. Bounded JSON preview copy and literal column names

- A localized **Copy preview as JSON** action sits beside the preview. Its visible scope is **First N of M rows only (JSON)**. It is disabled until generation completes and during generation, export, or an existing copy request.
- Copy serializes only the existing first 20 preview rows, preserving exact keys, full values, JSON numbers and `null`. Preview badges/metadata are excluded. It does not regenerate data, start a worker, save generated rows, change export options, or create a download.
- The complete UTF-8 JSON payload, including punctuation and indentation, must be at most 1 MiB (1,048,576 bytes). The boundary is inclusive. Over-limit data is not copied or truncated; the user is directed to save a JSON file.
- Only an explicit click calls the modern clipboard write API. Unavailable/rejected clipboard access opens a native dialog with complete read-only, selected JSON and keyboard/device-copy instructions. No legacy `execCommand` fallback is used. Close, Escape and backdrop dismissal clear the text and restore the enabled Copy action's focus. Late rejections cannot cover a newer open dialog.
- Schema/Seed/row edits, reset, template/settings replacement, regeneration, export start and pagehide invalidate pending copy feedback and clear manual-copy text. A stale clipboard promise cannot reopen a dialog or report success for a newer generation; an already-dispatched operating-system write cannot be cancelled by the page.
- Copy does not upload data, but the user-requested write leaves the page for the system clipboard, which other apps or device syncing may access.
- Column names such as `__proto__`, `constructor`, `toString` and `hasOwnProperty` are literal own data keys in worker rows and metadata. Preview badge lookup requires an own property after structured clone restores a normal object prototype. No columns are omitted, no `[object Object]` values are invented, and normal values have no false Invalid badge.
- Ordinary seeded outputs keep byte parity across all 23 types and all four export formats. Existing generation/export cancellation, immutable snapshots, first-20 retention and filename behavior remain unchanged.

## 15. Help viewport and app icon

- Help opens near the top of the viewport with safe-area-aware margins, a fixed title/Close row, and one independently scrolling reading area. Its last paragraph remains reachable at desktop, narrow phone, and short landscape heights.
- Opening Help after scrolling locks the background page without changing settings. Button, Escape, backdrop, and native close release the lock, restore the previous page position without smooth scrolling, and return focus to Help. A late close event cannot unlock a reopened dialog.
- Each opening starts at the first instruction. Tab reaches the labeled reading area; Page Down scrolls it while the Close button stays visible. Resizing an open dialog preserves viewport bounds.
- The header embeds the complete `assets/favicon.svg` artwork at the same aspect ratio. The embedded favicon and self-extract loader use the same SVG; no independently redrawn header glyph is retained.
