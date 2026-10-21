# DeskSom native filename index | isolated Windows proof of concept

**Status:** POC_PASS after a full fresh-run and separate scope/security checks on 2026-10-18. This is **not** part of installed DeskSom rc.12, its GitHub source release or live MCP catalog. No installed service, tunnel, key, root policy or task was changed.

## What it is

- Single Node.js ES module `index.mjs` using **Node 25.2.1 built-in SQLite** (`node:sqlite`) and **FTS5 trigram** for >=3-character filename-substring searches. No npm packages, Everything process/SDK, NTFS raw access, vector embeddings or administrator privileges.
- Initial recursive filename/path index under **one explicitly selected approved root**; stores file names, paths, directory flag, file size and modification time, not document contents.
- Recursive Windows `fs.watch` subscribed **before** the full scan; debounces events. A directory rename triggers reconciliation of its containing directory, covering old and new filename identities. Any failed watcher reconciliation marks the index STALE. A stopped/previous watcher is reported `WATCH_SESSION_UNVERIFIED`.
- An offline/new-file miss is **not an authoritative absence**. `search --verify-misses yes` performs an independent filesystem traversal if the indexed result is empty and reports whether the fallback completed. The index is optional; conventional DeskSom `start_search` remains unchanged.
- No symlink/junction traversal; each returned path is rechecked against the approved canonical root and actual disk resolution, blocking stale entries redirected outside the scope.
- Database must reside outside the scanned root. Its plaintext filenames and paths should be treated as potentially sensitive local data. Production integration should store it under the DeskSom user's ACL-protected private state, not the project tree.

## Run manually on a disposable directory

Create a configuration JSON (paths are illustrative):

```json
{
  "schema": "desksom.file-index-poc/v1",
  "root": "C:\\Projects\\Somner\\DeskSom\\ops\\my-index-test\\fixture",
  "db": "C:\\Projects\\Somner\\DeskSom\\ops\\my-index-test\\index.sqlite",
  "allowedRoots": ["C:\\Projects"]
}
```

Then run these from this source directory:

```powershell
node.exe .\index.mjs scan   --config C:\path\to\config.json
node.exe .\index.mjs search --config C:\path\to\config.json --q "activation" --limit 25
node.exe .\index.mjs search --config C:\path\to\config.json --q "new-file" --verify-misses yes
node.exe .\index.mjs status --config C:\path\to\config.json
node.exe .\index.mjs watch  --config C:\path\to\config.json
```

`watch` is a foreground best-effort watcher, not a Windows service or permanent background agent. Stop it explicitly. No negative search result should be treated as proof of nonexistence without fallback or another authoritative filesystem check.

## Qualification evidence

- Successful full-suite reruns: `ops\native-index-poc-20261018-r3\TEST_RESULTS.json`, `-r4`, and final `-r5`. The final r5 suite uses a **fresh 1,923-entry test tree**, tests FTS substring and short terms, literal SQL wildcard characters, create/rename/delete notifications, an offline missed update and fallback recovery, and NTFS junction avoidance.
- Independent security test: `ops\native-index-poc-20261018-policy\POLICY_RESULTS.json`: unauthorized root rejected, no database created for it, formerly indexed path replaced by outside-root junction suppressed from results, and a negative index lookup not treated as final.
- Two preserved first attempts (`ops\native-index-poc-20261018` and `-r2`) exposed bugs in subtree update bookkeeping and rename reconciliation. Those were fixed without changing production.
- **Final r5 observation:** 1,923 indexed entries, first scan 271 ms, full rebuild 247 ms, median warm FTS5 filename query **1.143 ms**, median warm direct filesystem walk **3.838 ms** (ten repeated queries each). SQLite DB 1,736,704 bytes. These are small-fixture measurements, **not** benchmarks against the Everything application, nor proof of linear performance at millions of files.
- Everything 1.4.1.1028 runs on this host, but its official ES CLI was not installed, so no direct Everything-vs-prototype query benchmark was attempted.

## Engineering limitations before MCP integration

1. SQLite's Node built-in module is experimental in the tested runtime. Confirm exact supported Node versions before shipping to friends.
2. `fs.watch` does not recover changes across downtime and may lose events; best-effort `WATCHING` state is not a guarantee of no missed files. Need durable USN catch-up or a bounded scheduled reconciliation policy before promising current whole-tree results.
3. An index of names/paths is not a content search or semantic index. Current FTS5/trigram schema stores some path text more than once, so its per-file storage overhead is higher than Everything's specialized format; scale benchmarks and schema improvements remain open.
4. Initial subtree scanning can hit access-denied files. Failed scans roll back, report STALE, and preserve earlier index rows without claiming completeness.
5. Add an **optional** bounded `find_files_fast` MCP operation only after isolated tests demonstrate scope enforcement, freshness and no regression to the existing 25 tools. Don't patch installed rc.12 or publish a replacement from this POC.
