# Fixtures

These fixtures are small QA targets for the host-native plugins.

They intentionally use host config for entries, output, library mode, and runtime
adapter choices. The Vite plugin only appears as `markless()` from
`@markless/bundler/vite` or as `marklessClient()` / `marklessServer()` from
`@markless/bundler/rolldown`.

Run the package build first so workspace consumers resolve the current plugin
output:

```sh
pnpm build
```

Then run an individual fixture from its directory, for example:

```sh
pnpm --dir packages/bundler/fixtures/vite-csr build
pnpm --dir packages/bundler/fixtures/rolldown-basic build
```
