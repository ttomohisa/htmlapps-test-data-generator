# Test Data Generator

[![GitHub Pages](https://github.com/ttomohisa/htmlapps-test-data-generator/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/ttomohisa/htmlapps-test-data-generator/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Single HTML](https://img.shields.io/badge/distribution-single%20HTML-16624F)](https://ttomohisa.github.io/htmlapps-test-data-generator/)

[日本語版 README](README.ja.md)

A local-first browser tool for generating reproducible test data. Along with normal mock data, it can mix missing, boundary, and invalid values for software testing. Generation and file creation stay inside the browser.

## Live app

### [Open Test Data Generator on GitHub Pages](https://ttomohisa.github.io/htmlapps-test-data-generator/)

[![Test Data Generator screenshot](assets/screenshot.png)](https://ttomohisa.github.io/htmlapps-test-data-generator/)

## Features

- Set a row count from 1 to 1,000,000, with a 10,000,000-cell safety limit across rows × columns.
- Run large generation in a Web Worker so the main UI remains responsive.
- Show progress and allow cancellation for both generation and file creation.
- Validate all rows in the worker while retaining only the first 20 rows in the page, then regenerate from the same Seed and settings when exporting.
- Serialize large exports in chunks instead of retaining every row object on the main thread.
- Apply **Normal / Light test / Stricter test** presets across all columns.
- Configure **Missing % / Boundary % / Invalid %** for each column.
- Export missing values as `null` in JSON / JSONL and empty cells in CSV / TSV.
- Generate boundary values for seven range-oriented types, including configured endpoints and relevant calendar edges.
- Generate type-appropriate invalid values for all 23 data types.
- Show Missing / Boundary / Invalid badges in preview without adding helper columns to exported data.
- Enter a Seed to reproduce the same generated rows from the same settings and row count.
- Leave Seed blank to create one automatically, or use **Change Seed** for a new value.
- Generate again with the previous Seed to reproduce a dataset after comparing results.
- Save / load `test-data-schema.json` containing row count, Seed, and column settings only.
- Start from User, Customer, Employee, Product, Order, Inquiry, or Access log templates.
- Confirm before a template replaces existing columns and inherit the selected Normal / Light / Stricter test mix.
- Add, duplicate, delete with Undo, and reorder columns.
- Generate the 14 existing basic types: sequence, integer, decimal, boolean, UUID, random string, choice, fixed value, date, date/time, money, percent, URL, and IPv4.
- Generate Japanese name, kana name, email, phone, postal code, prefecture, city/ward, Japanese-style address, and company name values.
- Choose full / surname / given name and Hiragana / Katakana output where applicable.
- Configure email domains and mobile / landline phone generation.
- Group Basic and Japanese data separately in the type selector.
- Validate type settings before generation and highlight invalid columns.
- Preview the first 20 rows without rendering the full dataset into the DOM.
- Copy those preview rows as JSON with the first-N-of-M scope shown, up to 1 MiB without truncation. Clipboard restrictions offer a selectable manual-copy dialog.
- Preserve literal column names such as `__proto__` in preview and all exports.
- Save the generated dataset as CSV, TSV, JSON, or JSONL.
- Choose UTF-8 or UTF-8 BOM for CSV / TSV and LF / CRLF line endings.
- Set the output filename while the extension follows the selected format automatically.
- Preserve commas, tabs, double quotes, and line breaks correctly in delimited exports.
- Persist column settings locally when browser storage is available.
- Japanese / English UI with responsive desktop and smartphone layouts.
- Fully local processing with runtime network connections blocked by CSP.
- Readable single-HTML build plus optional gzip self-extracting single-HTML build.

In v1.0.0, Japanese fields remain independent: for example, a generated name and email are not linked to the same person. Templates provide column layouts only; they do not create cross-column relationships. See [APP_SPEC.md](APP_SPEC.md).

## Usage

1. Enter the number of rows and an optional Seed.
2. Choose a test mix preset if needed.
3. Optionally apply a User, Customer, Employee, or other built-in template.
4. Adjust column names, data types, and test-value rates, then add, duplicate, delete, or reorder columns as needed.
5. Select **Generate data**. A blank Seed is created automatically.
6. Review the first 20 generated rows, test-value badges, and the Seed used. **Copy preview as JSON** copies only these rows, including numbers and missing-value `null`s. Save a JSON file for all rows or previews larger than 1 MiB.
7. Choose an output format and filename, then save the generated file.
8. Use **Save settings file** if you want to keep the row count, Seed, and column schema for later.

Numeric settings are required; enter `0` explicitly where allowed. Editing settings or Seed cancels pending work and requires regeneration before saving. Keyboard focus stays with a moved column or changed type; Delete moves to a neighboring name and Undo returns to the restored name.

Known filename extensions are normalized to the selected format (`sample.csv` becomes `sample.json` when saving JSON). Blank names use `test-data`.

## Privacy

Generation runs entirely in the browser. The app does not upload column settings or generated rows, and it does not use analytics or telemetry. Japanese dictionaries are embedded in the HTML. Column settings and Seed may be saved in local browser storage so they can be restored after reload. Generated rows are not stored automatically. Settings files contain configuration only and are created locally.

Copy writes only after you select the Copy action. The system clipboard may be accessible to other apps or device clipboard syncing; the app does not upload the copied JSON.

The default Content Security Policy includes `connect-src 'none'`.

## Development

The repository follows the `htmlapps-template` single-HTML application contract. Read [AGENTS.md](AGENTS.md) and [APP_SPEC.md](APP_SPEC.md) before changing the application.

The editable application source is:

```text
src/index.template.html
```

Do not edit generated files in `dist/` directly.

## Build

On Windows 10/11:

```bat
build-standalone.bat
```

Generated output:

```text
dist/
├─ index.html
├─ index.self-extract.html
├─ dependency-manifest.json
├─ build-size-report.json
├─ self-extract-manifest.json
└─ .nojekyll
```

To open the already-built readable version directly on Windows:

```bat
start-local.bat
```

## Browser support

Current stable desktop and mobile Chromium, Firefox, and Safari are the target. Direct `file://` opening is part of the template contract.

## License

[MIT License](LICENSE)

Application regression checks require Node.js 22 or newer (CI uses Node.js 24). The repository check tests source and all generated variants; the normal build also refreshes `test-data-generator.html`.
