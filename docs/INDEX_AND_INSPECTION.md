# Optional filename search and project inspection

## Filename search

`find_files_fast` accepts an exact configured root, a case-insensitive basename substring, an optional limit of 1 to 100, and optional `verifyMiss`. It returns bounded paths and metadata, not file contents. Queries with a literal run of three or more Unicode characters use a trigram-indexed candidate query; a separate literal filter preserves percent/underscore/backslash semantics. Shorter queries use an ordinary table scan. All query values are bound parameters. Responses report queryStrategy and honest result truncation.

In the owner Control Panel, use **Folders > Fast search**, select approved folders, review the complete proposal and approve the restart. Selecting an index root is separate from allowing ordinary file access. Node.js 25+ is required for this optional feature; the candidate's exercised runtime is 25.2.1. Start with one root and inspect observed progress before expanding coverage.

Example tool arguments, after that root has been approved and selected:

```json
{"root":"C:\\Work","query":"README","limit":10}
```

An unready root returns `INDEX_BUILDING`, `INDEX_WORKER_UNAVAILABLE`, or `ROOT_UNAVAILABLE`. A root absent at startup acquires no writer and opens no old database. Restore its directory and deliberately restart indexing before using it. Use ordinary `start_search` while it builds or needs attention. A healthy root remains searchable when another fails. All negative results are advisory. `verifyMiss: true` requests bounded full reconciliation after a miss; even then the response does not claim authoritative absence.

The private index uses one writer per selected database, filesystem watching, acknowledged file-write hints, and periodic reconciliation. Filename-less notifications trigger a bounded recovery sweep. Links are excluded from traversal. Successful user writes remain successful even if optional index maintenance is unavailable; they are not retried.

The default reconciliation interval is 30 minutes. The owner dialog offers 15, 30, 60 and 120 minutes. Disabling the feature preserves its private database. Changing approved file-tool roots currently requires disabling the index first, so the approved index profile cannot silently become stale.

## Project inspection

`inspect_project` accepts an absolute project directory within approved file roots. It reports recognized project files, npm script names, Git branch/HEAD, working-tree counts, recent commit identifiers/times, tracked-file counts and a language summary.

```json
{"path":"C:\\Work\\ExampleRepository"}
```

Inspection searches the specified path and approved ancestors for a repository. It does not recursively discover repositories inside a workspace container. A parent holding multiple Git worktrees can legitimately report `GIT_ROOT_NOT_FOUND_WITHIN_APPROVED_ROOTS`; point the tool at the actual checkout.

This is a bounded, advisory snapshot. It does not execute project scripts, install dependencies, run build/test commands, write Git state, enumerate an unbounded tree or establish workflow authority. Git subprocesses use a trusted absolute executable and a restricted environment, with concurrency and output/time limits. Conservative metadata checks can refuse unusual repositories. It is not atomic confinement against hostile concurrent filesystem replacement.

**Owner activation:** use Overview > Project inspection in the Control Panel. It prepares the exact enabled/disabled setting and trusted Git identity for review. Approval restarts only the verified idle local broker, not the private tunnel. The selected index profile, allowed folders and credentials remain unchanged. An owner-stopped service remains stopped. The public installer still defaults both optional features off.

The equivalent owner-local CLI is inspection with actions list, plan, apply and rollback. Write a request JSON containing {"enabled":true}, then use:

    DeskSom.ps1 inspection --action plan --state "STATE_DIRECTORY" --request "REQUEST.json" --out "PROPOSAL.json" --json
    DeskSom.ps1 inspection --action apply --state "STATE_DIRECTORY" --plan "PROPOSAL.json" --approve "EXACT_SHA256" --confirm-restart --json

Do not Apply through the same DeskSom connection that the restart will interrupt. Use the local panel or an ordinary owner terminal. After changing the catalog, refresh the existing ChatGPT connection metadata and verify exposure in a new chat. No server response proves that client-side step.

An interrupted change is visible through inspection --action list. Explicit inspection --action rollback --confirm-rollback verifies installation/source/host identity and exact before/after settings, then restores the previous configuration while leaving the local service stopped. It does not replay Apply. No hand-editing of sealed installed state is required.

If configured Git later becomes unavailable, projectInspection reports ready=false and the inspection tool refuses execution. Core tools remain available. Git child processes share a three-slot queue with reserved handoff to waiting work.

## Catalog and health

The original catalog contains 25 tools. Each optional feature adds one; both enabled give 27. Server-advertised capabilities do not prove which actions a particular ChatGPT conversation exposes or permits. Refreshing connection metadata is separate from restarting a Windows service.

Use the [readiness contract](READINESS_AND_RECOVERY.md) to distinguish core availability, aggregate index health and a particular root's readiness. A selected index's progress or saved configuration is not a completed scan.
