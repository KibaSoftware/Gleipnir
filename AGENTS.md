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
