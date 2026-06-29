# CLI

Status: Draft

The migrated CLI package is `packages/cli` and publishes the create/program
surface for Arcade apps.

The reusable create program must stay host-injected and environment-agnostic.
Do not ship an executable bin from `packages/cli` until a host-owned adapter
boundary exists for the target runtime.

Intended commands once host adapters exist:

```sh
pnpm create arcade my-app
arcade create my-app
```

The create lifecycle remains:

```txt
configure -> validate -> interact -> execute
```

The generated app uses:

```ts
import { arcade } from 'arcade/vite';
import { router } from 'arcade/router/vite';
import { defineConfig } from 'vite-plus';

export default defineConfig({
	plugins: [arcade(), router()],
});
```

Starter route files must use `.tsrx` or `.mdx`; templates must not create TSX
or JSX pages. Interactive prompts are allowed later, but non-interactive
`--yes` must remain deterministic for tests and agent-driven setup.
