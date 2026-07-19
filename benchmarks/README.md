# Gleipnir Controlled Benchmark Fixtures

This directory contains durable, versioned inputs for a future controlled comparison. It does not contain benchmark results and does not establish product benefit.

Each task must run in `no_gleipnir`, `current_gleipnir`, and `passive_gleipnir` arms with at least three independent repetitions. Repository commit, task bytes, hidden acceptance-suite digest, model/tool settings, and randomization must be frozen before execution. Reviewers must be blinded to the arm.

Runtime observations belong under ignored `.gleip/benchmarks/`; publish only reviewed, redacted data through an explicit release process.
