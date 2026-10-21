# DeskSom v0.2.0-rc.15 | Windows portable prerelease

This release combines rc.14's installed reliability and power-loss recovery improvements with Desktop Commander **0.3.0**. It remains a **release candidate for owner/friend evaluation**, not a generally qualified stable release.

## Download and install

Download **DeskSom-v0.2.0-rc.15-portable.zip**, verify its SHA-256 with **DeskSom-v0.2.0-rc.15-SHA256.txt**, extract it into a persistent source folder and run **Start-DeskSom.cmd**. The ZIP contains reviewed source and bootstrap scripts, not a shared dependency tree or credentials. Pinned runtime dependencies are installed through the ordinary reviewed installer.

Requirements: Windows x64, a normal non-administrator account, PowerShell7.4+, Node22.12+ for ordinary tools, and Node25+ for optional indexed filename search. Each new owner configures their own private tunnel and ChatGPT association. File-tool roots are not a terminal sandbox: terminal commands have the Windows account's permissions.

**Existing installations:** do not overwrite live runtime files by unpacking this archive. Keep the current instance running while an isolated candidate is qualified, then use an installation-bound upgrade with retained runtime and metadata. This ZIP is not a generic one-click upgrade script.

There is **no newly built EXE** in this release. The old rc.12 EXE and portable release are retained unchanged as historical artifacts; they are not relabeled as rc.15.

## Improvements

- A slow, missing or failed optional filename index no longer takes the core connection down. Provably old-Windows-boot writer leases can be moved intact into private evidence and replaced by a newly owned lease; ambiguous or live-writer cases remain refused.
- Responsive index and project-inspection controls, explicit recovery, faster literal filename queries, accurate truncation and corrected high-DPI wizard navigation.
- Upstream0.3.0 Windows file/process/search/configuration changes, deferred document loading, verified Windows Store PowerShell resolution and exact dependency overrides.
- A bounded, hash-pinned PDF parser compatibility fix enables the genuine font metadata needed for extraction. Regression tests assert actual PDF text and preserve originals during editing; XLSX and DOCX roundtrips also pass.
- Core catalog24 tools,25 with either optional feature,26 with both. Upstream removed only the legacy get_prompts action. Refresh the existing ChatGPT connection's metadata after an upgrade; do not recreate its private tunnel for a catalog change.

## Qualification and limits

Exact source commit **de10011818bb8345929b05df411377db1e418b8d**. The independently extracted archive passed **179/180 Node tests**, zero failures, with one Windows symlink-permission skip; **12 native groups plus the wizard navigation test**; **26 engine acceptance checks**. A fresh normal-user pilot passed **eight installed lifecycle checks**, including same-plan identity preservation, optional feature activation, clean restart/data retention, actual pilot-process crash with simulated old-boot metadata, missing-owned-task restoration and final park. The owner's default installation then passed real ChatGPT identity and disposable file/index acceptance on upstream0.3.0 with rollback retained.

The production dependency audit reported **zero findings** at qualification time; that is not proof of absence of all vulnerabilities. No whole-laptop power-cycle, independent external audit or second-machine/new-owner acceptance is claimed. The diagnostic source and dependency hashes detect drift; they are not a publisher code-signing certificate.

Source ZIP SHA-256: **efde6022692f7ae593236ee286bac2fe3b864e5bb611379449e27a89250476a0**. Detailed nonsecret evidence is in **DeskSom-v0.2.0-rc.15-QUALIFICATION.json**. Private credentials, machine identity, operator logs and installation state are not included.
