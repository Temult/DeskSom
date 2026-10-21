# DeskSom native filename index: owner controls v5

Status: SOURCE QUALIFIED, NOT INSTALLED OR PUBLISHED. 2026-10-18.

## Owner experience
- Folders tab: Fast search... button. New dialog offers a disabled-by-default switch, only preapproved file-tool roots, and 15/30/60/120-minute recovery choices.
- Review performs an exact installation-bound Plan and displays the SHA-256 digest. Apply requires a separate confirmation and brief restart of only the verified owned services; previously stopped instances remain stopped.
- Node 25 or newer is required ONLY to enable the experimental Node SQLite index; ordinary DeskSom installations may continue using their existing supported Node versions.
- Plans do not accept arbitrary index paths. Database names are hashed from approved root identities and live beneath the installer-owned private state. The normal Windows helper applies a protected owner/SYSTEM NTFS ACL to the database directory.
- File-tool root changes while indexing is active require disabling indexing first. A disabled historical index profile is cleared when roots change so it cannot strand ordinary folder management.
- Interrupted operations retain a pending receipt. Explicit index rollback checks service identity, active-call quiescence, observed task state and private configuration before restoring previous settings. It leaves services stopped, with no automatic replay or service restart.

## CLI actions available in candidate source
- index --action list --state STATE
- index --action plan --state STATE --request REQUEST_JSON --out PROPOSAL_JSON
- index --action apply --state STATE --plan PROPOSAL_JSON --approve EXACT_SHA --confirm-restart
- index --action rollback --state STATE --confirm-rollback
The CLI remains source-bound to the specific verified installed runtime and state.

## Qualification
- Full source npm.cmd test suite 67/67 PASS, zero failures, exit code 0.
- Native ControlPanel -LayoutCheck at 200 percent scaling PASS, 4 tabs, zero overlapping/offscreen controls. The new popup still requires independent human visual inspection.
- Exact owner-plan/apply/restart, unauthorized/stale rejection, explicit interrupted-apply rollback unit tests PASS on disposable install state.
- Actual Windows private directory helper and independent NTFS ACL inspection PASS: inheritance off, exactly owner and SYSTEM access control entries.
- Synthetic token broker MCP self-healing integration PASS with 26 optional tools, original 25 when disabled; download, writes, rename/delete, offline catch-up and watcher/periodic recovery PASS.
- Baseline C:\DL indexes 263712 entries. This test stage did not modify C:\DL or any running DeskSom service.

## Outstanding independent release gates
- Human inspect Control Panel popup and actual Plan/Apply/Rollback on a fresh installer-qualified Windows instance (NOT the current rc.12).
- Independent source and extracted-artifact review, startup with enabled/disabled catalog, Node 25 SQLite support and ordinary Node 22 disabled mode.
- Recovery from damaged databases, stale writer lock and unexpected process failures; stress watcher overflow, event storms, private ACL drift, and concurrent rebuild.
- Source resealing, release artifact build and separate owner approval before GitHub publication or replacing the installed rc.12. Credentials and original tunnel are not changed.
