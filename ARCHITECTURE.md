# Architecture

    Human: Start-DeskSom.cmd             Agent: Preflight / JSON CLI
               \                            /
                 One installation state machine
                    | approved plan + receipts
                    v
              Per-user owned runtime + private state
                    | non-elevated scheduled tasks
                    v
    ChatGPT -> private OpenAI tunnel -> authenticated loopback broker
                                              | local stdio
                                              v
                                  Desktop Commander tool engine

The root source is a distributable release, not a live installation. A plan binds source fingerprint, host, Windows SID, instance, runtime path, state path, work folders and port. Source, installed runtime and state are separate; no second computer needs the original developer's paths or Somner installation.

Preparation uses pinned npm lockfile dependencies, a recorded one-line-path overlay for the upstream engine's private config, and a pinned SHA-256-checked OpenAI tunnel archive. It runs security, installer, native Windows helper, modern/legacy MCP and integration checks before task registration. Per-instance mutexes, create-only ownership records, atomic progress writes and native-process receipts support bounded continuation. They are not transactional rollback of arbitrary commands or a guarantee across power loss.

The two Windows tasks are `DeskSom-<instance>-Local` and `DeskSom-<instance>-Tunnel`. Their owner SID, executable, arguments, working directory, run level, logon type and installation marker must match. A stable Windows launcher resolves the available PowerShell installation at startup rather than retaining a disappearing Store-version path. Repair can restore missing owned tasks or start stopped services; it cannot reset a different installation.

The runtime broker exposes one DeskSom identity tool and 24 admitted upstream tools. Its source-bound discovery adapter shortens 24 upstream descriptions, preserves their input schemas and provides explicit non-read-only mutation annotations. Server-advertised capability names in desksom_status are not per-conversation ChatGPT tool grants. It supports legacy MCP and the 2026-07-28 self-contained discovery/tool protocol. Unserved Desktop Commander UI metadata is removed. The same bounded, audited dispatcher executes tool calls; it never replays an ambiguous application mutation.

Host status adds instance, installationId and sourceFingerprint so local verification cannot mistake a different DeskSom installation for the intended one. A successful local verification is still not evidence that ChatGPT used the tunnel. That distinction is preserved in every JSON result.

Control-plane keys are entered locally and encrypted with DPAPI. The tunnel uses outbound HTTPS; the local MCP endpoint is loopback-only and bearer-authenticated. Work-folder controls do not sandbox terminal commands. See SECURITY.md for the actual trust boundary.
