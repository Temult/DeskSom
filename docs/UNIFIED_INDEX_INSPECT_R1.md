> Historical integration note: the source-only R1 statements below describe that checkpoint, not the current installed or published version. For rc.14 candidate behavior and remaining acceptance, read README.md, INDEX_AND_INSPECTION.md and QUALIFICATION.md.

# DeskSom unified filename index + project inspection: isolated source R1

This source candidate is based on the independently accepted native-index R12 commit
`17e231348ae5ac0f367c26eb35cfd61334485782` and adopts the exact
`project-inspect` R5 modules and six tests from commit
`06daefdcc1a7ab1c6a1d24e658a93864127b3fcf`.
It is not an installed or published release.

There is one broker, one existing Desktop Commander engine and no inspection service.
`fastFilenameIndex.enabled===true` and `enableProjectInspect===true` are independently
strict boolean flags. Neither feature is enabled by default. A disabled catalog
contains the 25 original tools. Each optional tool independently adds one read-only
descriptor. The four exact advertised cardinalities are 25, 26, 26, and 27.
The unified catalog, status and modern/legacy MCP discovery use the same broker.

Inspection runs under the existing authenticated `dispatchTool` accounting and
`quiescing` admission gate, with bounded outputs. The Git metadata and process
policy modules are transplanted unchanged, retaining stable-filesystem advisory
authorization, conservative Git config and alternates checks, maximum three
simultaneous Git subprocesses, timeouts and honest completeness fields.
No project scripts, dependency installation, workflow orchestration, GUI/browser
automation or Git writes are introduced.

Indexing retains selected-root enforcement, private SQLite, one writer per selected
database, best-effort watcher reconciliation and advisory misses. The accepted R12
stop-proof implementation is not edited. Owner-controlled service stops remain
boot/installation bound and require a verified lock-release acknowledgment.

The configuration serializer preserves the optional inspection flag and trusted Git
path separately from the index profile. There is no new owner UI or production
approval interface for switching inspection on in an installed service. A separately
qualified owner plan/enable path remains necessary for installed opt-in; this candidate
does not authorize editing installed state by hand.

The R5 inspection review explicitly does NOT establish atomic no-follow confinement
during adversarial filesystem replacement. Native Windows symlink permission
restrictions, its prior EBUSY teardown plus isolated passing retry, and bounded
Git metadata scans remain accepted limitations rather than silent security guarantees.

All combined tests are source-only and use disposable local fixtures. Production
rc.12, installed pilots, private tunnel/credentials, public GitHub and Orchestrator
are outside this candidate's mutation scope.
