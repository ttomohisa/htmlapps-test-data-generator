# Changelog

## [1.0.0] - 2026-09-06

### Stable release
- Promoted the v0.9.0 release candidate to the first stable release after final whole-app regression.
- Confirmed all 23 data types, seven built-in templates, deterministic Seed reproduction, test-value mixing, settings-file portability, CSV / TSV / JSON / JSONL export, large-data Worker processing, cancellation, responsive layouts, and fully local runtime behavior.
- Kept the v0.8.2 alignment fixes: consistent first-control baselines in column rows, compact Template Apply action, and aligned Save fields.
- Updated application version, README files, APP_SPEC, screenshots, standalone artifacts, and release metadata to v1.0.0.

### Compatibility
- Generated-data semantics remain unchanged from v0.9.0 for identical supported settings, row count, Seed, and export options.
- Settings files remain `version: 1` with generator `xmur3-mulberry32-v1`.

## [0.9.0] - 2026-09-06

### Release candidate
- Completed whole-app regression across all 23 data types and all seven built-in templates.
- Verified deterministic Seed reproduction with byte-identical JSON output for the same settings and a changed result for a different Seed.
- Verified Normal / Stricter test-value generation, settings-file save / load, column duplicate / reorder / delete Undo, and empty-state recovery.
- Verified CSV, TSV, JSON, and JSONL downloads, including UTF-8 BOM, CRLF / LF, CSV quoting, type-preserving JSON, and filename sanitization.
- Verified 100,000-row generation and CSV export, 1,000,000-row generation, the 10,000,000-cell guardrail, and both generation / export cancellation.
- Rechecked 320 / 360 / 390 px smartphone layouts, Japanese / English UI, help dialog behavior, and the v0.8.2 alignment fixes.
- Rechecked CSP / runtime network behavior and readable / self-extract standalone artifacts.

### Changed
- Version and release documentation updated for the v0.9.0 release candidate.
- No generated-data semantics or Seed algorithm changes.

## [0.8.2] - 2026-09-06

### Fixed
- Aligned the first row of controls in desktop column cards so column name, type, type-specific settings, test rates, and action buttons no longer appear vertically staggered.
- Restored the Template **Apply** button to a true content-sized grid track (`max-content`) on desktop and mobile so it cannot expand into unused space.
- Preserved the Save panel alignment fix from v0.8.1.

### Changed
- Stabilized compact field-label height and spacing for a cleaner column-editor rhythm without changing the app structure.

## [0.8.1] - 2026-09-06

### Changed
- Refined the overall visual design without changing the app’s structure: softer panels, cleaner controls, tidier buttons, and improved row-card presentation.
- Made desktop column rows align from the top instead of the vertical center, reducing the uneven look when different data types have different control heights.
- Kept the Template **Apply** button compact on both desktop and mobile.
- Simplified the Save panel by moving the filename extension note below the grid so the field row stays visually aligned.
- Updated the visible app version, help text, README files, and screenshots for the UI polish release.

### Fixed
- Reduced layout jitter in the generation and save sections, including the filename row called out during review.
- Made action buttons inside each column row use more consistent sizing and spacing.

All notable changes to this project are documented here.

## [0.8.0] - 2026-09-06

### Added

- Web Worker generation for large datasets with progress reporting and cancellation.
- Worker-based export for CSV, TSV, JSON, and JSONL with chunked serialization and save cancellation.
- Row-count support up to 1,000,000 with a 10,000,000-cell (`rows × columns`) safety limit.
- Generation snapshot behavior that keeps only the first 20 preview rows on the main thread and deterministically regenerates the full dataset during export.

### Changed

- The template Apply action is compact on desktop and smartphone layouts instead of expanding to a full-width mobile button.
- Save-panel fields are top-aligned so Format, Filename, Encoding, and Line endings share a consistent control baseline.
- Large jobs no longer retain every generated row object in the page.
- Bilingual help and README content now document large-data limits, progress, and cancellation.

### Compatibility

- Existing `xmur3-mulberry32-v1` Seed behavior is preserved; v0.7.0 and v0.8.0 produce byte-identical output for matching supported settings and export options.

### Privacy

- Workers are created from in-page Blob URLs and do not add runtime network access; CSP keeps `connect-src 'none'`.

## [0.7.0] - 2026-09-05

### Added

- User, Customer, Employee, Product, Order, Inquiry, and Access log dataset templates.
- Confirmation before a template replaces existing columns and generated preview data.
- Template inheritance of the currently selected Normal / Light test / Stricter test mix.
- Column duplication with preserved settings / test rates and automatic non-conflicting names.
- Direct Add column action in the zero-column empty state.

### Changed

- Bilingual help and README content now describe templates and duplicate-column actions.
- Mobile column action layout now accommodates move up, move down, duplicate, and delete without horizontal overflow.

### Privacy

- Built-in templates are embedded configuration only and introduce no runtime network dependency.

## [0.6.0] - 2026-09-05

### Added

- Normal / Light test / Stricter test presets for applying test-value mixes across all columns.
- Per-column Missing %, Boundary %, and Invalid % controls with total-rate validation.
- Deterministic missing, boundary, and invalid-value allocation through the existing Seeded PRNG.
- Boundary-value generation for sequence, integer, decimal, date, date/time, money, and percent columns.
- Type-specific invalid values for all 23 supported data types.
- Preview badges and aggregate counts for missing, boundary, and invalid cells without modifying exported schemas.
- Test-value settings in saved `test-data-schema.json` files while keeping v0.5.0 files loadable.

### Changed

- Seed input placeholder is now `42`.
- JSON / JSONL missing values serialize as `null`; CSV / TSV missing values serialize as empty cells.
- Column layout now includes a dedicated Test values area and switches to card layout earlier on narrower screens.
- Bilingual help and README documentation now describe test-value generation and presets.

### Security

- HTML-like and multiline invalid strings continue to render as plain text in preview and are never interpreted as markup.

### Privacy

- Test-value generation remains fully local and introduces no runtime network dependency.

## [0.5.0] - 2026-09-05

### Added

- Deterministic text Seed support using the versioned `xmur3-mulberry32-v1` generator.
- Automatic Seed creation when the field is blank, plus Change Seed and Generate again with same Seed actions.
- Reproducible UUID generation from the deterministic PRNG.
- `test-data-schema.json` save / load for row count, Seed, and column settings.
- Compatibility and size validation for imported settings files, with replacement confirmation.

### Changed

- All dataset randomness now flows through the seeded PRNG rather than `Math.random()` or random UUID bytes.
- Browser-persisted settings now include Seed.
- Bilingual help and documentation now explain reproducibility and settings-file behavior.

### Privacy

- Automatic Seed creation may use the browser cryptographic RNG locally, but generated data remains fully local and no network request is introduced.

## [0.4.0] - 2026-09-05

### Added

- CSV, TSV, JSON, and JSONL export from the generated dataset.
- UTF-8 / UTF-8 BOM selection for CSV and TSV.
- LF / CRLF line-ending selection.
- Editable output filename with automatic format-specific extension.
- Local persistence for export preferences and format-aware save status.

### Changed

- Completed the first generate → preview → save workflow.
- Updated bilingual help and documentation for local file export.

### Fixed

- Delimited output now safely quotes separators, double quotes, line breaks, and surrounding whitespace.

### Privacy

- Files are assembled with browser Blob APIs; no upload or runtime network request is introduced.

## [0.3.0] - 2026-09-05

### Added

- Japanese name generator with full / surname / given-name modes.
- Hiragana / Katakana name generator.
- Email, Japanese-style phone, postal code, prefecture, city / ward, fictional Japanese-style address, and company-name generators.
- Embedded Japanese dictionaries and grouped Basic / Japanese type options.
- Email-domain validation and phone-kind settings.

### Changed

- New default schema demonstrates Japanese name and email generation.
- Bilingual help now explains that Japanese columns are independently generated in v0.3.0.

### Privacy

- Japanese dictionaries are embedded in the single HTML; no geocoding, postal, or data-generation API is used.

## [0.2.0] - 2026-09-05

### Added

- Decimal, boolean, UUID, choice, date, date/time, money, percent, URL, and IPv4 generators.
- Type-specific settings for ranges, formats, choices, decimal places, and URL base.
- Stronger per-type validation and invalid-column highlighting.
- TEST-NET IPv4 generation for safe example addresses.

### Changed

- Updated bilingual help and documentation for the v0.2.0 type set.
- Extended smartphone form styling to multiline choice input.

### Privacy

- New generators remain fully local and do not make network requests.

## [0.1.0] - 2026-09-05

### Added

- Initial Test Data Generator application based on the current `htmlapps-template`.
- Row-count configuration from 1 to 100,000.
- Column add, delete with Undo, and reorder controls.
- Sequence, integer, random string, and fixed-value generators.
- First-20-row result preview.
- Local persistence for settings.
- Japanese / English UI and responsive smartphone column cards.
- Matching inline SVG app icon and favicon.
- Bilingual in-app help describing v0.1.0 scope and local-processing behavior.

### Privacy

- No runtime dependencies or external data services.
- Runtime CSP retains `connect-src 'none'`.
