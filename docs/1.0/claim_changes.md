# Product Claim Changes

## 1.0 primary claim

Gleipnir is a passive-first, local evidence ledger and precision risk observer for coding-agent work.

## Removed claims

- General agent optimization.
- Proven rework, token, reviewer-time, or completion-quality reduction.
- Autonomous task control or planning.
- Independent merge authorization or deployment verification.
- Current coding-agent adapter integration beyond managed instruction files.
- Current GitHub Action integration beyond use of the local CLI in CI.
- Behaviorally distinct `strict` or `enterprise` enforcement.

## Corrected terminology

| Previous wording                       | 1.0 wording                                             |
| -------------------------------------- | ------------------------------------------------------- |
| Token waste avoided                    | Estimated removable text                                |
| Verification evidence from status      | Agent-reported verification claim                       |
| Review readiness proof/source of truth | Gleipnir policy inference / final local evidence bundle |
| Scope adherence                        | Inferred scope relationship plus exact changed paths    |
| Requirement completion                 | Requirement traceability and locally supported status   |
| Context optimization                   | Experimental local context compression                  |
| Strict/enterprise mode                 | Reserved compatibility alias                            |

## Threat model

Gleipnir keeps task, repository, command, and evidence data local. Hashes, event chains, atomic writes, and locks detect accidental corruption, crashes, and ordinary concurrency conflicts. They do not defend against a malicious user or process with equivalent filesystem permissions. External trust requires externally supplied attestations or signatures; Gleipnir does not invent them.

## Placeholder packages

`@gleip/adapters` and `@gleip/github-action` remain only if needed for package/API compatibility. Documentation must label them placeholders with no runtime integration behavior. The supported integration is generated agent instructions and direct invocation of the local CLI.
