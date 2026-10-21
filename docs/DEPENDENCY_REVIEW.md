## rc.14 audit refresh: October 20, 2026 local / October 21 UTC

A fresh read-only npm audit of the candidate lockfile at 2026-10-21T01:01:25Z reported **12 affected-package findings: 6 high, 6 moderate, 0 critical**. npm exited 1 because advisories were present, not because the lookup failed. The lockfile SHA-256 was 2990533fcc3585006a2cf89200d395fed95b922f79c5ea93f643f8e7a8b5d41f. No dependency version was changed and no audit-fix command was run.

Compared with the October 17 snapshot below, markdown-it is additionally reported as high severity at the package level. The reviewed advisories are GHSA-vfgh-jcmw-g37q (inline HTML parsing, requiring HTML-enabled input) and GHSA-gfr2-rv44-r23c (multi-line reference parsing with default options). Their affected 14.x ranges are patched in 14.3.3; these are denial-of-service findings, not proof of an exposed DeskSom remote-code-execution path. The package count includes propagated parent findings and must not be described as twelve demonstrated independent exploits.

Primary references refreshed October 20:
https://github.com/advisories/GHSA-vfgh-jcmw-g37q
https://github.com/advisories/GHSA-gfr2-rv44-r23c

Remediation remains a separate compatible dependency-refresh work item. Keep the exact pinned engine while qualifying this index-lifecycle repair; then map actual parser/image input paths, evaluate patched leaves and test any engine upgrade separately. Do not dismiss the findings or silently suppress the audit. This disclosure does not introduce an extra owner approval gate for ordinary installation.

## Historical October 17 dependency snapshot

# Dependency security review: disclosed advisories

**The pinned upstream dependencies contain disclosed advisories; this document is not an additional human approval gate.** Functional installation tests passed, but an October 17, 2026 read-only npm audit of the pinned production dependency tree reported **11 affected-package findings: 5 high and 6 moderate, with no critical finding reported**. Propagated dependency findings are included in that count; it is not a count of 11 independently demonstrated exploits.

The tree remains pinned to Desktop Commander 0.2.52 and its reviewed lockfile. No `npm audit fix`, forced override, major engine upgrade or production mutation was used to hide the findings. Each actual installed dependency is separately hash-sealed by the installer; that proves identity, not absence of vulnerabilities.

## Findings and scope

| Dependency or chain | Audit category | Review status |
| --- | --- | --- |
| sharp and bundled image codecs | High | Several upstream advisories affect the pinned version. Package updates are available, but compatibility and actual Windows exposure need review. |
| braces through chokidar / md-to-pdf | High | Stack-exhaustion denial of service advisory; no patched braces version was listed by the reviewed advisory. Reachability through this application's accepted inputs is not yet established. |
| sprintf-js through argparse / js-yaml / gray-matter | Moderate | Denial-of-service advisory propagates through the PDF dependency chain. Reachability has not been independently established. |
| uuid through exceljs | Moderate | Buffer-bound-check advisory; determine whether the affected API forms are used before assigning operational exposure. |
| Desktop Commander / parent packages | Propagated | npm also marks packages depending on the affected components. Do not count those as separate demonstrated exploit mechanisms. |

A high package severity is not proof of a Windows remote-code-execution path. In particular, the reviewed sharp/librsvg advisory describes its RCE conditions on glibc-based Linux; this candidate targets Windows x64. Other bundled-codec findings still need their own platform and input-path analysis. Do not dismiss all image-processing risk merely because that one condition is Linux-specific.

## Next remediation work

Evaluate a separate, pinned dependency-refresh candidate. Upstream Desktop Commander 0.3.0 metadata uses sharp 0.35.5 or newer but also changes the engine and raises the Node baseline, so it must be treated as an explicit compatibility upgrade. Its PDF-related chain still needs review; a major upgrade is not proof that every audit finding disappears.

Map the affected packages to actual tool input paths, update compatible patched components where possible, and rerun clean installation, tool-catalog, native lifecycle and negative tests. For an advisory without a published fix, consider a narrowly reviewed implementation replacement or an explicit documented risk decision, not a fake version, suppressed audit or broad reset. The advisories remain documented, and the installer does not require a separate dependency sign-off before use or distribution.

Primary advisory references, reviewed October 17, 2026:
https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
https://github.com/advisories/GHSA-wq5f-xc86-pv6w
https://github.com/advisories/GHSA-f88m-g3jw-g9cj
https://github.com/advisories/GHSA-rgj7-g3m4-5g8c
https://github.com/advisories/GHSA-hp3w-g68c-fv3c
https://github.com/advisories/GHSA-w5hq-g745-h8pq
