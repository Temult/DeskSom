# Maintainer release checklist

This checklist is for producing a new reviewed release. It is not a repair procedure for a user's modified installation. Never regenerate a user's hashes to conceal drift.

1. Work on an isolated source branch/worktree. Do not edit deployed source or dependencies. Review every changed file and keep a known-good parent commit.
2. Keep the engine, SDK lockfile and tunnel archive/executable hashes pinned. Review any dependency update explicitly; a passing hash only proves identity, not security.
3. Update README, AGENTS.md, AI_INSTALL.md, installation/security guides, command contract and the CI workflow together. Human and AI entry points must use the same installation core.
4. Run pure installer units, native PowerShell helper tests, modern/security suites and the 26-check engine acceptance in a clean runtime. Run a normal-user Windows lifecycle rehearsal with a distinct instance, port and work folder. Include repeat-install, stop/start, missing-task restoration, data retention and negative ownership/integrity cases.
5. Remove only test-owned tasks and verified disposable files. Preserve failed receipts and explicit reconciliation; do not report an uncertain stop or cleanup as complete.
6. Stage only public source, docs, test harnesses, examples, policy, lockfile and the release manifest. Exclude install state, ownership markers, dependency caches, keys, DPAPI files, logs, task XML exports and local qualification paths.
7. Normalize source line endings, generate the manifest from the reviewed file set, then validate the exact bytes. Hashes in a release must match the actual extracted archive, not merely the worktree before Git normalization.
8. Commit the reviewed source; export a source archive; independently extract it to a clean directory and verify every manifest path, byte count and digest. Bind a separate qualification report to the final commit/archive hash. Run package smoke tests from that extracted copy.
9. Publish only after inspecting the final repository/branch and confirming public-distribution authorization. Do not force-push or overwrite a remote branch that changed since the last read. Keep the release candidate label until the second-machine pilot and new ChatGPT connection are observed.

## Pilot acceptance

Have a non-developer use the prepared ZIP and Start-DeskSom.cmd on their own Windows account. Record prerequisite discovery, source validation, folder/permission review, initial install, interruption recovery, private owner credential entry, current ChatGPT connection creation, a genuine identity call, a disposable file round-trip and verified cleanup. No pilot key, account detail or raw log belongs in this repository.

Publishing source is not publishing one shared ChatGPT plugin. Secure MCP Tunnel is a private-connection mechanism. Every recipient creates their own installation and private account association. Public plugin-store submission has different endpoint requirements and is outside this release.

Official account/transport reference, checked October 17, 2026: https://developers.openai.com/api/docs/guides/secure-mcp-tunnels . Prefer the actual current UI and supported account capabilities over historical screenshots.
