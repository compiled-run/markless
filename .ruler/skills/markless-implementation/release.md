# Release Workflow

- The owner controls authentication, 2FA, registry publication, tag pushes, and GitHub release creation. Never automate irreversible release steps.
- Establish package and dependency closure before packing: intended packages, versions, workspace dependency ranges, build order, included files, and public entry points must agree.
- Run `vp pack`, inspect the produced tarballs, and install them in a clean consumer to verify imports, types, runtime behavior, and the absence of workspace-only dependencies or unintended files.
- Release scripts must be fail-closed and resumable. Validate prerequisites before mutation, record completed stages, stop on ambiguous state, and make reruns skip only steps already verified.
- After owner-executed publication, verify registry versions and dist-tags, package contents, repository tags, and GitHub release metadata against the release plan.
- Package or tooling changes must also read `implementation.md` and `bundler.md`.
