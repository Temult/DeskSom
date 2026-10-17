# Security model

DeskSom is a **trusted-local remote command executor**, not a sandbox or a multi-user security boundary. A connected agent can invoke terminal tools with the running Windows account's permissions. Work-folder restrictions apply to direct file tools, not the shell. Keeping service/state outside those work roots reduces accidental exposure but does not confine a malicious authorized shell caller.

**Known dependency advisories:** The pinned dependency audit has documented findings in [the dependency review](docs/DEPENDENCY_REVIEW.md). The findings are disclosed, not an additional maintainer-approval or installation gate. Passing functional tests does not resolve them.

## Controls and their limits

The broker is loopback-only and requires a high-entropy bearer. Private credentials are encrypted with Windows DPAPI and stored under an explicit current-user/SYSTEM DACL. Child tool processes do not receive the tunnel control-plane key. Source manifests, dependency seals, archive and executable hashes, host/user binding, instance ownership, bounded requests/results, task identity checks and no automatic replay provide reproducible operational checks.

These checks do not protect against the same authorized Windows user intentionally modifying both code and trust records, administrator access, prompt injection, account compromise, credential theft, dependency compromise before release review, or a malicious request approved by the caller. The source manifest is not a publisher signature. Do not call source hashing tamper-proof authentication.

The installer rejects elevation, whole-drive/system roots, unsafe Windows namespace paths, reparse-point paths, overlapping installation/state folders and work roots that include the service or its keys. It refuses foreign tasks and occupied unowned locations. These restrictions prevent common mistakes; they do not replace Windows account isolation.

## Owner consent

Preflight is read-only except for a requested create-only plan output. Installing requires the exact reviewed plan digest plus acknowledgment of full-user terminal access. The owner handles any prerequisite UAC/license prompts. Tunnel account creation, workspace association, permissions and potential spending are not silently automated.

No CLI accepts a plaintext API-key argument. The owner enters the runtime key through a local masked prompt. Never send that prompt through a transcript-capturing remote agent, screen-share secrets, paste keys into chat, or publish raw logs. Existing credential files are not silently overwritten.

## Uncertain operations and maintenance

A timeout or lost response may follow a completed write. Private receipts distinguish intent, running and confirmed completion. An uncertain preparation subprocess blocks automatic replay. An unresolved disposable verification receipt blocks a second exercise. Repair defaults to diagnosis and cannot reset arbitrary source, dependencies or credentials. Intentional owner stops are respected. Uninstall removes only stopped, verified owned tasks; it retains credentials, runtime and work files.

Audit and upstream process logs may contain sensitive task arguments, outputs, paths or user content. They remain private and can grow while services run. Public diagnostics use a fixed field allowlist rather than a promise that arbitrary raw logs can be perfectly redacted. Review even the small summary before sharing.

## Distribution and reporting

Distribute the source, not your live installation, tunnel, state or API keys. Each user installs their own private connection. OpenAI's private tunnel transport does not make this suitable for a public shared-shell plugin. For vulnerabilities, contact the repository maintainer privately; do not post tokens, exploit details or other people's files in a public issue. No security-response SLA or independent external audit is claimed.

## Tool annotations are not authorization

Compact MCP descriptions and `readOnlyHint:false` flags are truthful declarations of server behavior, not permission grants. The server's capability report does not know which tools a given ChatGPT conversation sees or is authorized to call. A missing or denied client-side action must not be bypassed through a shell tool, alternative transport or newly created account. See `docs/CHAT_DISCOVERY_DIAGNOSTIC.md`.
