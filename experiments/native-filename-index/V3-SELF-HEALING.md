# DeskSom native self-healing filename index v3 | isolated developer candidate

**2026-10-18 / 2026-10-19 UTC. Not installed. Not pushed.** The original rc.12 service, tunnel, keys, task set, and public release are unchanged. Development branch is experimental, not a deployment authorization.

## Implementation

- \`self-healing-worker.mjs\` owns one SQLite database per exact owner-approved root and runs in an isolated Node worker thread. All mutations go through one writer. SQLite uses WAL to allow concurrent reads of the last committed snapshot.
- \`self-healing-client.mjs\` sends bounded \`flush\`, \`touch\`, \`status\`, \`full\`, and \`stop\` requests to the worker, with no uncertain-call replay.
- \`fast-files.mjs\` optionally starts the worker when \`fastFilenameIndex.enabled=true\` **and** \`selfHealing=true\`, and retains the earlier feature-disabled / snapshot read-only behavior. A search first requests a pending-change flush, then reads and validates the index. \`verifyMiss:true\` requests a full differential reconciliation and repeats an indexed miss. Absence is never claimed certain from an index snapshot.
- \`broker.mjs\` calls \`notifyCompletedWrite\` only after an acknowledged successful file-tool operation. Exactly covered: \`write_file\`, \`write_pdf\`, \`edit_block\`, \`move_file\`, \`create_directory\`. Arbitrary shell writes use the filesystem watcher, not inferred process output.
- The worker attaches \`fs.watch({recursive:true})\` before the initial scan; external changes mark their parent directory dirty, coalesced over 150 ms. Reconciliation compares immediate directory children with indexed children. Newly introduced directories are recursively indexed, and removed/renamed subtrees are repaired. Known direct writes flush their directory immediately.
- A newly empty index uses a direct bulk walk, avoiding unnecessary per-directory SQLite lookups. An existing index uses a single in-memory map of indexed paths and a complete filesystem traversal; **only added/removed/type-changed entries get database writes**. This also catches missed offline filesystem events on restart. Full updates are transactionally atomic.
- Paths are root-checked; directory junctions/symlinks are not followed; search results are independently checked on disk before disclosure. Database directories must resolve inside configured private state. Unavailable watched paths, errors or missed watcher notifications produce stale/advisory results.
- An independent worker thread keeps the broker request loop responsive during a full scan. Unlike a privileged USN-reader design, this requires no administrator rights.

## Evidence

- \`self-healing.test.mjs\` passed on disposable Windows folders: new downloads, rename, delete, new nested directory, whole-directory rename, direct write-through, stop/restart and offline catch-up. The worker did not write to an indexed production folder.
- \`self-healing.integration.test.mjs\` passed through an actual isolated HTTP DeskSom broker using only a synthetic bearer. Feature enabled advertises **26** tools and performs the external-download, DeskSom \`write_file\`, root-denial and \`verifyMiss:true\` checks. The original disabled-feature \`modern.test.mjs\`, \`security.test.mjs\`, \`catalog.test.mjs\`, \`fast-files.test.mjs\` suite passed **16/16** with normal **25** tools.
- The first slow full-directory reconciliation failed to finish within its test budget (preserved evidence). It was replaced with a single-pass map-based diff. The subsequent optimized benchmark against the real \`C:\DL\` DB passed:
  - Existing indexed entries: **263,712**.
  - Startup catch-up: **10,167 ms**.
  - Second full differential reconciliation: **12,512 ms**, **40,665 directories visited**, **0 added / 0 removed rows**.
  - A reader simultaneously querying SQLite while the diff ran took **97.109 ms**. Other recorded read/query costs in the v2 benchmark were 57–89 ms end-to-end.
  - The self-healing DB with indexed parent paths is **182,947,840 bytes** (approx. 174.5 MiB); larger than the earlier v2 132,009,984-byte snapshot, an acceptable but measurable space trade-off to review.
  - All actual C:\DL accesses in these tests were read-only. Database/receipts are isolated under DeskSom \`ops\`.
- Scale evidence: \`ops\self-healing-scale-20261018-bulk\OPTIMIZED_DIFF_RESULTS.json\`, synthetic unit test receipts in \`ops\self-healing-test-*\TEST_RESULTS.json\`. Keep earlier incomplete \`ops\self-healing-scale-20261018\` test artifacts as failure evidence; never infer an unfinished transaction committed.

## How to activate in a future qualified release (NOT performed)

The already optional \`fastFilenameIndex\` broker configuration would require owner approval. Example concept, not installation instructions:

\`\`\`json
{
  "fastFilenameIndex": {
    "enabled": true,
    "selfHealing": true,
    "indices": [
      {"root": "C:\\DL", "database": "<private-state-path>\\indices\\DL.sqlite"}
    ]
  }
}
\`\`\`

Both the root and database must be validated against the **installed** DeskSom approved file roots and the private-state filesystem identity. The sample is illustrative; do not paste a placeholder path into a live config.

## Remaining risks and deliberately deferred work

1. Windows \`fs.watch\` cannot guarantee notifications during downtime or after buffer overflow. The worker catches up on startup, on explicit \`verifyMiss\`, and via dirty-directory events. A configurable low-frequency full reconciliation timer and explicit missed-event status remain future release work.
2. The broker read path may return a last committed snapshot while full reconciliation runs. This is intentional. No indexed negative result proves global absence without a completed live check.
3. Cold initial build was substantially slower than the previous v2 one-shot bulk index; optimized differential refresh has been benchmarked, but first-time setup needs independent timing and memory profiling before friend-facing installer integration.
4. Node's built-in SQLite is experimental in Node 25.2.1. Need pinned-runtime qualification and private database ACL checks on installation.
5. Single-writer ownership is scoped to one active broker. A production release must prevent two brokers opening the same index writer, and must make crashes/restarts/partial migrations explicit.
6. This is not a semantic or content index. No cloud credentials, OAuth, protected Cyberdeck state, or task authority are involved.

No changes to installed DeskSom rc.12, no temporary background index daemon left running, no release or GitHub push.
