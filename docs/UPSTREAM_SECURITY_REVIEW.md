# Upstream security review and staged engine upgrade

Reviewed October 21, 2026. DeskSom rc.14 remains pinned to Desktop Commander 0.2.52. The complete 0.3.0 migration is deliberately a separate rc.15 integration effort.

## Immediate rc.14 compensating fixes

The actual pinned `dist/tools/schemas.js` accepts any number as `kill_process.pid`; its handler forwards the parsed value to the process implementation. The DeskSom wrapper previously bounded timeouts but did not reject PID zero, negative values or fractions. Upstream PR #767 fixes this among several larger process-tree changes. DeskSom now rejects non-positive, non-integer and out-of-range PIDs for `kill_process` and `force_terminate` before forwarding to the engine. Verification never sends dangerous PIDs to the old engine: pure validation and broker integration tests confirm rejection and unchanged broker boot identity.

The pinned engine's `validatePath` handles missing paths by resolving an existing parent or ancestor and then appending unresolved segments. This cannot safely distinguish a nonexistent regular path from a dangling symbolic link or junction. Upstream PR #759 replaces that logic with recursive missing-path resolution. DeskSom now independently resolves the prospective destination before dispatching file mutations. It follows dangling links within a bounded walk, checks the actual destination against the approved roots, propagates non-ENOENT errors as rejection, and checks both rename operands and PDF output paths. It does not alter the pinned engine or its tool schemas. Ordinary files and safe internal links remain supported.

References: https://github.com/wonderwhy-er/DesktopCommanderMCP/pull/759 and https://github.com/wonderwhy-er/DesktopCommanderMCP/pull/767 . The path-resolution approach follows the upstream fix; DeskSom's small compatibility guard is separately tested rather than importing the full newer engine.

`file-operation-guard.test.mjs` covers ordinary creation, outside-root writes, dangling junctions, internal targets, independent output operands and permission failures. The existing real-broker integration suite also checks rejected invalid process IDs, unchanged boot identity, refused dangling-junction writes and an ordinary successful write/readback. Asynchronous path checks run after dispatch admission so they cannot bypass the quiescence barrier.

These guards are not a terminal sandbox and do not establish atomic containment against malicious same-user filesystem swaps. They cover the known deterministic file-tool cases while preserving ordinary Windows-user terminal access. The bundled engine's direct APIs remain upstream 0.2.52; this mitigation applies at DeskSom's HTTP and stdio dispatch boundary.

## rc.15 migration assessment

The 0.3.0 review must independently reconcile engine configuration isolation, removed `get_prompts`, tool metadata/schema differences, process output/termination semantics, asynchronous document support readiness, Windows paths and symlinks, Node 22.12+ prerequisites, dependency seals and audit output. Do not simply change the pinned version or reuse rc.14 acceptance numbers. Preserve rc.14 rollback files and public historical releases until a distinct candidate is qualified. No shared dependency directory or default installed service is modified by upstream investigation.
