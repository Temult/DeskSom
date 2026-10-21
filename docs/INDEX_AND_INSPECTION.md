# Optional filename search and project inspection

## Filename search

`find_files_fast` accepts an exact configured root, a case-insensitive basename substring, an optional limit of 1 to 100, and optional `verifyMiss`. It returns bounded paths and metadata, not file contents. Queries shorter than three characters use an ordinary indexed-table lookup; longer queries use the SQLite trigram index.

In the owner Control Panel, use **Folders > Fast search**, select approved folders, review the complete proposal and approve the restart. Selecting an index root is separate from allowing ordinary file access. Node.js 25+ is required for this optional feature; the candidate's exercised runtime is 25.2.1. Start with one root and inspect observed progress before expanding coverage.

Example tool arguments, after that root has been approved and selected:

```json
{"root":"C:\\Work","query":"README","limit":10}
```

An unready root returns `INDEX_BUILDING` or `INDEX_WORKER_UNAVAILABLE`. Use ordinary `start_search` while it builds or needs attention. A healthy root remains searchable when another fails. All negative results are advisory. `verifyMiss: true` requests bounded full reconciliation after a miss; even then the response does not claim authoritative absence.

The private index uses one writer per selected database, filesystem watching, acknowledged file-write hints, and periodic reconciliation. Filename-less notifications trigger a bounded recovery sweep. Links are excluded from traversal. Successful user writes remain successful even if optional index maintenance is unavailable; they are not retried.

The default reconciliation interval is 30 minutes. The owner dialog offers 15, 30, 60 and 120 minutes. Disabling the feature preserves its private database. Changing approved file-tool roots currently requires disabling the index first, so the approved index profile cannot silently become stale.

## Project inspection

`inspect_project` accepts an absolute project directory within approved file roots. It reports recognized project files, npm script names, Git branch/HEAD, working-tree counts, recent commit identifiers/times, tracked-file counts and a language summary.

```json
{"path":"C:\\Work\\ExampleRepository"}
```

Inspection searches the specified path and approved ancestors for a repository. It does not recursively discover repositories inside a workspace container. A parent holding multiple Git worktrees can legitimately report `GIT_ROOT_NOT_FOUND_WITHIN_APPROVED_ROOTS`; point the tool at the actual checkout.

This is a bounded, advisory snapshot. It does not execute project scripts, install dependencies, run build/test commands, write Git state, enumerate an unbounded tree or establish workflow authority. Git subprocesses use a trusted absolute executable and a restricted environment, with concurrency and output/time limits. Conservative metadata checks can refuse unusual repositories. It is not atomic confinement against hostile concurrent filesystem replacement.

**Activation limitation:** the broker and configuration serializer support an independently enabled inspection flag, and the maintainer's existing installation uses it. This development candidate has not yet added a general owner-facing installed enable/disable workflow for inspection. Do not hand-edit a sealed installation or assume upgrading automatically enables the tool. The public installer remains default-off for both optional features.

## Catalog and health

The original catalog contains 25 tools. Each optional feature adds one; both enabled give 27. Server-advertised capabilities do not prove which actions a particular ChatGPT conversation exposes or permits. Refreshing connection metadata is separate from restarting a Windows service.

Use the [readiness contract](READINESS_AND_RECOVERY.md) to distinguish core availability, aggregate index health and a particular root's readiness. A selected index's progress or saved configuration is not a completed scan.
