# Performance Workflow

Read `implementation.md` first. Its fixture-hardcoding ban applies to every optimization and is not repeated here.

- Establish a reproducible baseline and a correctness oracle before optimizing.
- Define the noise protocol before measuring: environment, warmup, sample count, aggregation, variance treatment, and the threshold for a meaningful change.
- Treat hypothesis selection as the high-reasoning step. State the suspected cost, evidence, expected mechanism, and falsifying result before changing code.
- Set explicit performance budgets and correctness constraints for the affected path. Compare results against both the baseline and those budgets.
- Keep an optimization only when repeated measurements clear the noise threshold and the correctness oracle remains green; report regressions and inconclusive results.
