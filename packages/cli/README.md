# create-markless

Create Markless apps:

```sh
npm create markless@latest
```

(`npm create markless` requires a `create-markless` package on the registry,
which is not part of this release.)

## Scaffolding inside an existing workspace

If the new app lands inside a directory tree that already belongs to a pnpm,
npm, yarn, bun, or Deno workspace, and the app is not one of that workspace's
declared members, the CLI says so and asks what you want. The default is to keep
the app separate: only the app is installed, and the enclosing workspace's
config, lockfile, and `node_modules` are left exactly as they were.

Two flags answer that question up front, which is also how a non-interactive run
(`--yes`, no TTY, CI) chooses:

- `--workspace` — Add the app to the enclosing workspace, if there is one. This
  writes one member entry into the workspace's own config file
  (`pnpm-workspace.yaml`, the `workspaces` field of `package.json`, or the
  `workspace` field of `deno.json`/`deno.jsonc`), preserving that file's
  comments and formatting, and then installs at the workspace root.
- `--no-workspace` — Keep the app separate from the enclosing workspace.

Both flags do nothing when no enclosing workspace was found. Without
`--workspace`, no file outside the new app directory is ever written. An app
that already matches a member declaration is left alone entirely: no question,
no config change, and a normal workspace install.

See the repository for documentation: https://github.com/compiled-run/markless
