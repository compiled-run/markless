# CLI

Status: Draft

The migrated CLI package is `packages/cli` and publishes the create/program
surface for Arcade apps.

The reusable create program must stay host-injected and environment-agnostic.
The executable bin is a thin host-owned adapter for Node. It owns `process`,
filesystem access, and command spawning, then delegates argument handling and
project creation to the reusable `CreateProgram`.

Supported command:

```sh
create-arcade my-app
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
or JSX pages. Interactive TTY runs are a Clack-backed onboarding flow, not raw
flag collection or a manually printed text menu:

```txt
◇ Welcome to Arcade

  Let's build you an app.
  Choose a starting point, and Arcade will set up the routes, scripts, and defaults.

? What are you building today?
  › Learn Arcade
    A small TSRX counter app. Best first project.

    Build an app
    A routed app with document.tsrx plus 404 and 500 pages.

    Write docs
    An MDX docs site with a layout and sidebar components.

    Full-stack app
    App routes plus api/ and middleware/ files.

? What should we call it?

? Where should it run?
  › Node
    Creates a package.json project for pnpm, npm, or yarn.

    Deno
    Creates a deno.json project with npm: imports.

    Bun
    Creates a package.json project tuned for Bun.
```

The flow uses real `select` prompts for choices so the active option is
highlighted, important labels stay prominent, and descriptions render as prompt
hints. It also asks whether to install dependencies and initialize git, explains
each choice, shows a `Ready to create?` summary, and lets the user create or
cancel before files are written. Runtime choices must be ordered Node, Deno, Bun.
Starter labels map to existing template IDs: Learn Arcade -> `minimal`, Build
an app -> `app`, Write docs -> `docs`, and Full-stack app -> `full-stack`.

Non-interactive flags remain stable for tests and agent-driven setup, including
`--yes`, `--starter`, `--format`, `--no-install`, and `--no-git`.
