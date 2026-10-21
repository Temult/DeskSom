# Native indexed search v2 | Real-tree benchmark and optional MCP tool

**State:** tested isolated development candidate, NOT deployed, NOT published. Owner-provided C:\DL is an approved read-only indexing subject. Database and receipts are stored under DeskSom project's ops directory, not inside C:\DL. No service/task/tunnel/credential change.

## Native indexer
Source: `index-v2.mjs` (Node 25.2.1 built-in SQLite + FTS5 trigram). One process does a bounded scan; no permanent daemon. The current snapshot is indexed by lowercase canonical full path, basename and kind only. Directory reparse links/junctions are skipped, and returned paths are rechecked on disk. No content vectorization or file reads.

Owner config JSON (example only):
```json
{"schema":"desksom.index-v2/v1","root":"C:\\DL","database":"C:\\Projects\\Somner\\DeskSom\\ops\\native-index-scale-20261018\\DL-index-v2.sqlite","allowedRoots":["C:\\DL"]}
```
```powershell
node.exe index-v2.mjs scan --config <config.json> --max-ms 180000 --max-items 500000
node.exe index-v2.mjs search --config <config.json> --q A21 --limit 30
node.exe index-v2.mjs search --config <config.json> --q unlikely --verify-miss yes
node.exe index-v2.mjs status --config <config.json>
```
A scan is capped by time and entries; if incomplete it returns `PARTIAL_SNAPSHOT`. Directory errors also preclude completeness. **Index misses never mean definitive absence**, including immediately after `COMPLETE_SNAPSHOT`, because the filesystem may have changed. Existing DeskSom `start_search` remains the fallback. A full rebuild writes a separate database then swaps it in, preserving the previous database under `.previous` for reconciliation (additional subsequent swaps require operator reconciliation of that backup).

## Real-world C:\DL test
- Initial bounded directory-only read traversal: 263,748 entries including 36 links, 40,665 directories, 4.89 seconds; no directory access failures.
- Actual index `C:\DL`: 263,712 entries, 40,665 directories, 36 skipped links, zero read failures. Build 8.135 seconds; SQLite database 132,009,984 bytes (132.0 MB, decimal).
- Three query patterns (12 repeated indexed calls each): `A21` indexed end-to-end median 89.48 ms vs filesystem-walk 2747.99 ms; `manifest` 56.985 ms vs 2784.38 ms; invented negative filename 88.625 ms vs 2823.25 ms. Indexed times include launching Node and opening SQLite. Full walks are single-run comparisons, not repeated medians. All filesystem walks completed. Query-only SQL times ranged 7.5–43.1 ms. Results were bounded at 30.
- These results are **not** a head-to-head benchmark against Everything. Everything 1.4.1 is running on this PC, but its ES CLI is not installed. FTS database remains large per entry; optional compression and external-content design need separate benchmarks.
- Evidence: `ops/native-index-scale-20261018/dl-config.json`, `DL_BENCHMARK.json` and `DL-index-v2.sqlite`. The index is a snapshot, not a long-running daemon.

## Optional MCP adapter
`fast-files.mjs` provides a feature-gated read-only `find_files_fast` tool. `broker.mjs` includes it only when a new owner-reviewed **private broker configuration** sets `fastFilenameIndex.enabled=true` and supplies an exact allowed root plus a prebuilt database **inside DeskSom's private state**. This candidate does not silently enable the feature in the installed rc.12 service.

An enabled HTTP broker lists 26 tools instead of the normal 25. Query arguments: `root` (exact indexed/approved root), `query` (1–256 filename-substring characters), `limit` (1–100). The adapter opens SQLite read-only, validates database location/ownership and output paths at use time, returns bounded positive matches, and never claims an indexed miss is definitive. No automatic scan, service restart, index mutation or new privilege.

**Deployment prerequisites:**
1. A proper installer/control-panel owner opt-in that uses the installed approved root policy as source of truth and provisions an ACL-restricted DB inside the private state. The benchmark DB under `ops` is NOT a production database.
2. A completeness/freshness strategy for downtime and watcher overflow (periodic explicit reconciliation or USN catch-up). This version intentionally does not run a permanent watcher at scale; v1 isolated fixtures tested `fs.watch` create/rename/delete only.
3. Node/SQLite supported-version policy, source manifest reseal and standard full engineering acceptance. Never swap this experimental broker into the installed rc.12 runtime in place.

## Tests and limitations
- `fast-files.test.mjs`: read-only adapter, positive/negative, root & private-DB protection, stale junction exclusion.
- `fast-files.integration.test.mjs`: disposable synthetic-key HTTP broker, feature enabled 26-tool discovery, authorized query and denied root, non-authoritative miss.
- Existing disabled-feature `catalog.test.mjs`, `modern.test.mjs`, `security.test.mjs`: 16/16 PASS with temp pinned SDK junction and engine overlay; production catalog still 25.
- The original v1 `fs.watch` tests (under prior POC) are not a proof that the current v2 snapshot is automatically fresh.
- No public GitHub push, no deployed MCP upgrade and no credentials touched.
