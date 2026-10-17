# Installation records and continuation

The installer stores its private `install.json` separately from the source and runtime. It records the installation ID, exact approved plan/digest, environment references, phase, completed stages, pending stage, qualification fingerprint and deliberate owner-stop marker. Paths and host/SID metadata are local operational data, not public support output.

The normal path is: approved plan -> RESERVED -> source and settings -> dependencies -> pinned tunnel -> qualification -> PREPARED (optional) -> launchers and owned local task -> INSTALLED -> LOCAL_READY. Owner-only credential setup and a verified tunnel follow afterward. A local phase never records a genuine ChatGPT tool call on the caller's behalf.

Before each preparation stage, the pending intent is persisted. Completion is recorded only after the operation returned and its outputs passed checks. `native-active.json` separately captures INTENT, RUNNING, EXITED, START_FAILED or UNCERTAIN for spawned preparation commands. Losing the controller is not proof that its child stopped. Unresolved states block subprocess replay.

The runtime has a create-only ownership marker. An existing directory, source file, credential or task cannot silently become owned by this instance. Copying source is create-only or equality-checked; dependency drift is a failure, not permission to run npm over a live installation. The same approved plan can reuse already qualified preparation while preserving the installation ID and secret.

Per-instance Windows mutexes exclude concurrent installer/control operations. They are not durable job transactions and cannot guarantee exactly-once effects after arbitrary power loss. Inspect receipts and external effects on ambiguity.

STOPPED records a deliberate owner decision. Read-only repair remains available, but applied `start-stopped` repair must not undo the stop. An explicit `start --enable` can restore operation after owner review. TASKS_REMOVED means stopped, verified owned tasks were removed; source, runtime, keys and work remain retained. Restoring a missing task does not constitute permission to execute application work.

Disposable verification uses a unique nonce-bearing file and a private intent/WRITTEN/PASS receipt. It independently checks content before removing that file. An unresolved receipt prevents another mutation exercise; it does not disable read-only diagnosis. Reconciliation must retain the original receipt and explicitly document the fixture's identity and final state.

This release does not automatically migrate an old 0.1.x service, replace credentials, uninstall prerequisites, purge caches, remove arbitrary user data, replay protected work or purchase account access. These boundaries are intentional; a recovery tool must be narrower than an unrestricted reset button.
