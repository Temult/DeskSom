# Desktop Commander 0.3.0 integration in DeskSom rc.15

## Scope and baseline

This candidate is a separate modernization line built on the qualified rc.14 R6 reliability/security source. It pins @wonderwhy-er/desktop-commander 0.3.0 and @modelcontextprotocol/sdk 1.32.1. The private tunnel client stays at 0.0.16. Neither the running rc.14 service nor its dependencies are modified by candidate development.

The upstream npm archive was inspected before integration: SHA-256 1908f99216d4184b024430bdce8ea1c6934341ca6b129a6b3ec454a3cce19877. Its npm integrity value is retained in package-lock.json. Dependency versions and resolved integrity entries are frozen by that lockfile; only explicit ripgrep preparation runs after an ignore-scripts install.

## Actual compatibility changes

**Tool catalog.** Upstream retired get_prompts. DeskSom now advertises 24 core tools, 25 with either optional feature, or 26 with both filename indexing and project inspection. The native Windows owner verifier checks the exact names, not just a count. A call to the removed tool returns TOOL_NOT_EXPOSED. Existing client metadata can still show an old action; refresh it after eventual deployment without recreating the private tunnel.

**Node prerequisites.** Core support is Node 22.12+, not any Node 22 build. All installer entry points, the graphical wizard, test selector, package engines and policy agree. Optional filename indexing still requires Node 25+ and is qualified locally on 25.2.1. Hosted core checks use the exact 22.12.0 floor.

**Windows PowerShell.** Upstream 0.3.0 resolves program names from PATH, deliberately excluding the working directory. Windows Store execution aliases can launch successfully while ordinary filesystem stat reports EACCES; the old bare pwsh.exe request therefore failed on the maintainer's laptop. DeskSom resolves a fixed known PowerShell installation or Store alias, asks that program for its actual executable and version, and verifies a regular file inside the expected Program Files installation tree. Only default/bare PowerShell7 requests are translated. Explicit custom shell requests are preserved; no work-folder executable search or secret-bearing command probe is introduced. Resolution is cached while the executable remains present.

**Lazy document support.** The private engine bootstrap now invokes upstream preloadFileSupport after initialization, matching the upstream CLI's behavior. A document-support loading reply is not success and no mutation is automatically replayed. The integration fixture repeats only read-only readiness observations before invoking each write exactly once.

**PDF font metadata.** A text-bearing, two-page PDF fixture reproduced an upstream dependency failure: CalculateGlobalStats called toLowerCase on an absent font.name. The old smoke checked only the result's isError flag and could miss an error rendered as ordinary text. The new test asserts actual extracted text. pdf2md 0.3.4 needs PDF.js's documented fontExtraProperties option to receive the real parsed font names used by its Markdown transformations. One known-byte overlay enables this option; it does not invent names or alter extracted text. This option can increase font-metadata memory use, only on the PDF parsing path.

The parser's original SHA-256 is 04e42b2ef2f78cf80405b7b2ba30fbd9e64b6bcf6bfa1bf7afe6385452690074; reviewed patched SHA-256 is 2ea6df3a8cb714c1cda454759e009151f9b1abbfeb35f33f632f64e57495ba87. setup.mjs accepts only that exact upstream version and before-image. Engine and management checks verify the pinned patched bytes. The installed dependency seal also covers this file. See pdf-font-overlay.mjs and its refusal/idempotence tests. Primary API reference: https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html (fontExtraProperties).

## Dependency audit

The first integration produced 10 audit findings because upstream's package-level overrides do not apply automatically to a consuming project's root dependency graph. DeskSom now carries exact reviewed root overrides: md-to-pdf/chokidar 4.0.3, exceljs/uuid 11.1.1, proxy-addr 2.0.8 and argparse 2.0.1, plus its retained markdown-it 14.3.3. A fresh npm audit --omit=dev returned zero findings after these changes. This is an observed audit at a point in time, not a guarantee of security. The first failing audit and corrected audit are both retained privately.

## Regression coverage and promotion boundary

The initial integrated source suite passed 175 tests with one Windows symlink-permission skip. That preliminary result is not substituted for the later exact-package qualification after PDF and prerequisite tests were added. The final PR/receipts identify the exact counts and archive hashes.

The added real-broker test verifies PDF text extraction and page deletion while preserving the original PDF; XLSX and DOCX write/read roundtrips; default and bare-alias PowerShell; absence of get_prompts; and upstream identity 0.3.0. Existing suites cover 24/25/25/26 catalog combinations, old-boot index recovery, authenticated quiescence, rejected invalid PIDs and dangling-link mutations, project inspection, Windows owner control, package source integrity and the 26-case engine acceptance contract.

Source and loopback tests are not a normal-user rc.15 Scheduled Task lifecycle or a true whole-machine power-cycle. Do not replace the default rc.14 runtime until an exact candidate has passed the appropriate installed trial and retained rollback procedure. No second-machine owner acceptance or public binary installer release is claimed by this document.
