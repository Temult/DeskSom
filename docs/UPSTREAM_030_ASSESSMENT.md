# rc.15 upstream 0.3.0 assessment, October 21, 2026

Disposition: isolated compatibility investigation only. This branch does not change DeskSom's installed engine, default tunnel, rc.14 dependency lock or public release. The current rc.14 candidate remains on Desktop Commander 0.2.52 with narrow process-ID and dangling-link file-operation guards.

## Exact upstream examined

Desktop Commander npm package 0.3.0, latest stable GitHub release observed October 21, published October 13. The downloaded npm tarball SHA-256 was `1908f99216d4184b024430bdce8ea1c6934341ca6b129a6b3ec454a3cce19877`, registry integrity `sha512-2EXNxuztSIW3fQw6OEGMek39M8yQlKinXooMYtNR4wRLhtA+f3b0cbxBggAfDeKemMWltm1qWQy/t2Av9VmYLw==`. Package engines requires Node >=22.12.0.

Primary references: https://github.com/wonderwhy-er/DesktopCommanderMCP/releases/tag/v0.3.0 and https://github.com/wonderwhy-er/DesktopCommanderMCP/blob/v0.3.0/package.json .

The registry package was installed into a fresh private assessment directory with all npm lifecycle scripts disabled, then only the required ripgrep rebuild was explicitly run. A new dependency lock was saved privately. The upstream root overrides for md-to-pdf/chokidar, exceljs/uuid, proxy-addr and argparse were reproduced deliberately in the assessment root; transitive packages do not propagate their own root overrides automatically. The observed `npm audit --omit=dev` result for this private resolution was **0 findings**. This is dated evidence, not a guarantee about future advisories or a production DeskSom audit result.

## Observed compatibility changes

1. The old `get_prompts` tool is absent. Applying DeskSom's current disabled-tool filter yields 23 engine tools: **24 including DeskSom identity**, or **26 with both optional native tools**. Existing exact 25/26/26/27 tests and client metadata expectations cannot be reused unchanged.
2. DeskSom bypasses upstream index.js to avoid hosted-remote onboarding, telemetry refresh and automatic browser downloads. In 0.3.0, index.js also invokes `preloadFileSupport()` after initialization. The custom DeskSom engine bootstrap must explicitly preserve that background document-package preload while continuing to avoid automatic Chrome download. The isolated probe did so, and PDF reading was available after warm-up.
3. The first isolated probe failed a process call: upstream's stricter program resolver reported `pwsh.exe was not found on PATH`. Retrying through a new, preserved probe with the independently resolved **absolute PowerShell executable** passed. The underlying Windows Store execution-alias/PATH interaction needs a dedicated source and installed-lifecycle regression before migration. This is a real observed integration issue, not proof of a general upstream failure.
4. The configuration-isolation overlay anchor remains present. It was patched only in the private assessment dependency tree, with before/after SHA-256 receipts; the live and rc.14 dependency trees were untouched.
5. Node 22.12+ is the new core minimum. Optional DeskSom SQLite indexing still has its separately qualified Node 25+ requirement. Installer prerequisites and documentation need to distinguish both floors.

## Scoped execution evidence

The second fresh probe used real stdio MCP initialization and the actual 0.3.0 tool implementation. It passed five checks: removed get_prompts confirmed, ordinary write/read, PowerShell process completion/output with an absolute executable, bounded content-search invocation, and PDF read after explicit background preload. Observed initialization was about 510 ms on the warm local host; that single sample is not a performance comparison. The client closed the isolated engine afterward. No new public endpoint or account connection was created.

The first failed probe and its private logs were retained. PASS_SCOPED does not claim full DeskSom acceptance, all document formats, full search completeness, process-tree recovery, normal-user task installation, source/dependency upgrade safety, cold reboot, or client-side custom-connection refresh.

## Next integration work

Create an actual rc.15 source/dependency candidate pinned to 0.3.0 and an exact lock. Update the bootstrap and explicit shell resolution, reconcile expected catalogs and schema/annotation hashes, qualify ordinary and first-use document operations, rerun process/search failure and output-recovery tests, audit the exact production resolution, and exercise a separate installed instance. Keep rc.14's qualified runtime and rollback files until rc.15 has passed those checks. Do not copy a full upstream engine tree into the live service or change a sealed installed manifest as a shortcut.
