# Context Compression Policy

Gleip 0.9.0 adds deterministic, repository-local compression for large,
repetitive execution evidence. It is not a provider proxy, hosted service,
telemetry feature, or task summarizer.

## Supported Evidence

Compression is limited to non-authoritative execution evidence:

- `test_output`
- `build_output`
- `log_output`
- `structured_json`
- `search_results`
- `file_listing`
- `command_output`
- `git_diff`

Source code bodies, dependency manifests, lockfiles, CI configuration, policy and
instruction files, infrastructure definitions, migrations, auth/payment
configuration, unknown content, and sensitive-looking output pass through.

## Protected Task-Contract Graph

The following active artifacts are never compressed, replaced by references, or
treated as cleanup cache:

- canonical task and revisions
- active task amendments and effective task
- derived brief and brief coverage
- requirement ledger and source excerpts
- accepted plan
- normalized scope state and scope budget
- approval, policy, safety, and completion state
- unresolved findings and verification metadata

Structural metadata wins over caller hints. A caller cannot mark a canonical task,
active brief, requirement ledger, accepted plan, or scope artifact as
`test_output` to force compression.

## Local Store

Originals are stored before compressed output is emitted:

```text
.gleip/context/objects/<sha256>
.gleip/context/index.json
```

The object identity is SHA-256 over the exact UTF-8 original. Retrieval validates
the reference, rejects path traversal, detects corruption, and prints the exact
original content. Identical content deduplicates to the same object.

## Commands

```sh
npx --no-install gleip run -- <command>
npx --no-install gleip compress --type test_output < output.txt
npx --no-install gleip compress --audit --json < output.txt
npx --no-install gleip retrieve sha256:<hash>
npx --no-install gleip stats --json
```

`run` preserves the child process exit status and handles stdout and stderr as
separate evidence streams. `compress --audit` reports classification, confidence,
and passthrough reasons without replacing content.

## Metrics

Gleip estimates tokens as `ceil(characterCount / 4)`. Gross estimated tokens
removed is the original estimate minus the compact display estimate. Net estimated
tokens saved subtracts compression metadata overhead and retrieval overhead. Gleip
does not fabricate unobservable metrics.

## Authority Boundary

Compressed displays may be shown to an agent, but they are never used as scoring,
scope, plan, approval, verification, review-readiness, or requirement-completion
truth. Internal decisions use exact structured data, current git state, or exact
retrieved originals.

## Local-Only Guarantee

Compression makes no network calls, no model/API calls, no telemetry, and no
provider interception. Original content and metadata stay inside `.gleip/` in the
repository.
