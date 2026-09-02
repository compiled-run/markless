Local builds of yuku-tsrx 0.1.5 (host + darwin-arm64 and linux-x64-gnu bindings), wired through `pnpm.overrides` in the root `package.json`.
0.1.5 lets `@for` / `@if` parse as direct children of a member-expression tag (`<accordion.root>`); it is not on npm yet.
Once 0.1.5 is published: delete this folder, remove the three `pnpm.overrides` entries, run `pnpm install`.
