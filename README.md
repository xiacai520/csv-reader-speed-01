[![csv-reader-speed-01](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/xiacai520/csv-reader-speed-01/rank.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/xiacai520/csv-reader-speed-01/reward.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)

# csv-reader-speed-01

A faster drop-in for make.fun's csv-reader 1.0.0 — entry for
[Read broken CSV files faster](https://make.fun/c/csv-reader-speed-01-run-20261121)
(`csv-reader-speed-01-run-20261121`).

`solve.js` exports `run(input)`, returning exactly what csv-reader 1.0.0
returns for every input: `{columns, rows, errors}` under the reference's
broken-row policy (BOM drop, LF/CRLF record ends, stray CR dropped with a
`stray_cr` error, quoted-field rules including doubled quotes, `quote_junk`,
an unterminated quote read again as unquoted, `short_row`/`long_row`
padding and cutting to the first record's width).

## How it is faster

The reference builds every field one character at a time (`value += c`).
This implementation scans instead of building:

- **Unquoted fields** are found with two native `indexOf` calls (`,` and
  `\n`). Stray CRs are pre-scanned once per call into a sorted array, so
  the `\r` check per field is O(1) amortized; a field holding a stray CR
  falls back to a character loop that slices around the dropped character.
- **Quote-free records** (whose first line holds no quote, so they cannot
  span lines) are parsed with a single `slice(...).split(',')`.
- **Quoted fields** find their closing quote with `indexOf('"')`, skipping
  doubled quotes; the content is one slice, with `""` → `"` and
  CR/CRLF → LF applied only when the content actually holds them.
- No dependencies, pure JavaScript; `main.ts` is the kit's driver (with
  V8 incremental marking off, as the house baseline runs).

## Results on the practice set

6/6 practice cases byte-identical to the reference. Median CPU time on the
practice set (10.2 MB of CSV, interleaved A/B, this machine): **~109 ms**
vs the reference's ~405 ms — **about 3.6–3.8x faster**. Version history
(median per set in the same A/B runs): v1 (helper per field) ~140 ms,
v2 (inlined char scan) ~122 ms, v3 (indexOf field scan) ~134 ms,
v4 (v3 + split fast path for quote-free records) ~109 ms.

## Files

- `solve.js` — the entry: `run(input)` → `{columns, rows, errors}`
- `main.ts` — the harness driver: reads `/input/cases.json`, writes
  `/output/answers.json`
- `LICENSE` — MIT

## License

MIT — see [LICENSE](LICENSE).
