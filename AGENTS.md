# Agent Instructions

Coding agents working in this repository must optimize for reviewable, merge-ready changes.

## Rules

- Make minimal, scoped changes that directly address the request.
- Avoid speculative refactors, broad rewrites, and unrelated cleanup.
- Avoid unnecessary dependencies; justify any new dependency in the final explanation.
- Preserve tests and CI behavior. Do not weaken or remove checks to make work pass.
- Add or update tests when behavior changes.
- Keep package boundaries clear and avoid premature abstractions.
- Explain changed files after coding, including verification performed and any known gaps.

When uncertain, prefer the smallest reversible change that preserves the repository conventions.

<!-- GLEIP:START -->
## Gleip Workflow

- This repository uses Gleip local guidance. Codex-style and generic coding agents must run Gleip before editing code.
- If the local package command cannot be run, report that Gleip evidence is unavailable and continue only within the user's existing authority.
- Before editing code, check `.gleip/state.json`. If `enabled` is false, treat Gleip guidance as inactive without creating a mandatory confirmation prompt.
- If enabled, run `npx --no-install gleip preflight "<user task>"`.
- Read `.gleip/canonical-task.json` first. Treat it as the authoritative task contract.
- Read `.gleip/brief.md` as a derived navigation aid and `.gleip/scope-budget.json` as scope guidance.
- If the brief omits or conflicts with the canonical task, follow the canonical task.
- Check active task revisions and amendments in `.gleip/canonical-task.json` before planning.
- For broad or sensitive changes, draft a short implementation plan and run `npx --no-install gleip validate-plan "<plan>"` before implementing it. Other plan checks are advisory.
- Treat `aligned` as ready, review `advisory`, clarify `needs_clarification`, clean up `needs_cleanup`, and request approval for `needs_approval`.
- During implementation, use the expected paths in `.gleip/scope-budget.json` as guidance and explain necessary expansion.
- Keep changes minimal and scoped to the canonical task.
- Do not edit or commit files under `.gleip/` unless the user explicitly asks.
- During iteration, run the narrowest existing validation that covers the changed area.
- Do not rerun a full validation suite while repository state is unchanged.
- For large repetitive command output, use `npx --no-install gleip run -- <command>` or pipe evidence through `npx --no-install gleip compress` only when the output is non-authoritative execution evidence.
- Treat compressed displays as compact evidence views only. Retrieve exact originals with `npx --no-install gleip retrieve <reference>` whenever omitted evidence is needed.
- Never replace canonical task state, active brief, requirement ledger, accepted plan, scope state, completion state, approvals, policy, source code, dependency manifests, or CI configuration with compressed output.
- Before final completion, verify every mandatory canonical requirement with available local evidence, then run the complete required validation once. Rerun it only after changes that can invalidate the result.
- Before claiming completion, run `npx --no-install gleip check --incremental`.
- Run `npx --no-install gleip status --compact` whenever Gleip's expected next action is unclear.
- Address cleanup and action-required findings before finalizing. Request approval for approval-required changes.
- Before the final response, run `npx --no-install gleip status --compact`. Report `advisory`, `needs_attention`, `needs_cleanup`, or `needs_approval` clearly.
- Before the final response, run `npx --no-install gleip finalize` and report its exact-state completion status. The legacy `report` command remains compatibility output only.
- Treat the final evidence bundle under `.gleip/runs/<run-id>/final/latest.json` as the primary local completion artifact.
- Final response should concisely include changed files or summary, verification run, residual risks, and Gleip status when relevant.

## Gleip working standard

### 1. Think before coding

Do not assume, hide confusion, or silently choose between ambiguous interpretations.

Before implementing:
- State material assumptions explicitly.
- Resolve ordinary ambiguity from local repository evidence when the risk is low.
- Ask before editing only when requirements conflict, protected changes need approval, user decisions are missing, or safety-sensitive scope is unclear.
- If a simpler approach exists, say so.
- Push back when the requested approach appears overcomplicated, risky, or broader than needed.

### 2. Simplicity first

Implement the minimum code that solves the requested problem.

Rules:
- Do not add features beyond what was asked.
- Do not add abstractions for single-use code.
- Do not add flexibility, configurability, or extension points that were not requested.
- Do not add error handling for impossible scenarios.
- If the solution is much larger than necessary, simplify it before finalizing.
- Prefer the implementation a senior engineer would consider direct and boring.

### 3. Surgical changes

Touch only what the task requires.

When editing existing code:
- Do not improve adjacent code, comments, naming, or formatting unless required.
- Do not refactor unrelated code.
- Match the existing style, even if a different style would be preferable.
- If unrelated dead code is found, mention it instead of deleting it.
- Remove only imports, variables, functions, files, or tests made obsolete by your own changes.
- Every changed line should trace directly to the user’s request.

### 4. Goal-driven execution

Turn the task into verifiable goals before implementing.

Examples:
- “Add validation” means define invalid-input cases, test them, then make them pass.
- “Fix the bug” means reproduce the bug with a focused test, then make it pass.
- “Refactor X” means verify behavior before and after the refactor.

For multi-step tasks, state a brief plan in this format:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

### Gleip checklist for every coding task

- [ ] Check `.gleip/state.json`
- [ ] Run `npx --no-install gleip preflight "<task>"`
- [ ] Read `.gleip/canonical-task.json`
- [ ] Use `.gleip/brief.md` as an index, not a replacement
- [ ] Validate broad or sensitive plans with `npx --no-install gleip validate-plan`
- [ ] Implement within `.gleip/scope-budget.json`
- [ ] Run narrow validation while iterating and complete required validation once before final completion
- [ ] Use compression only for non-authoritative execution evidence; retrieve exact originals before relying on omitted diagnostics
- [ ] Run `npx --no-install gleip check --incremental`
- [ ] Run `npx --no-install gleip status --compact`
- [ ] Run `npx --no-install gleip finalize`
- [ ] Include concise review evidence: changed files or summary, tests run, risks, and Gleip status
<!-- GLEIP:END -->
