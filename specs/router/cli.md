# CLI

Status: Draft

The migrated CLI package is `packages/cli` and publishes the create/program
surface for Markless apps.

The reusable create program must stay host-injected and environment-agnostic.
The executable bin is a thin host-owned adapter for Node. It owns `process`,
filesystem access, and command spawning, then delegates argument handling and
project creation to the reusable `CreateProgram`.

Supported command:

```sh
create-markless my-app
```

The create lifecycle remains:

```txt
configure -> validate -> interact -> execute
```

The generated app uses:

```ts
import { markless } from '@markless/core/vite';
import { router } from '@markless/core/router/vite';
import { defineConfig } from 'vite-plus';

export default defineConfig({
	plugins: [markless(), router()],
});
```

Starter route files must use `.tsrx` or `.mdx`; templates must not create TSX
or JSX pages. Interactive TTY runs are a Clack-backed onboarding flow, not raw
flag collection or a manually printed text menu:

```txt
◇ Welcome to Markless

  Let's build you an app.
  Choose a starting point, and Markless will set up the routes, scripts, and defaults.

? What are you building today?
  › Learn Markless
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

    Bun
    Creates a package.json project tuned for Bun.

? Which editor do you use?
  › VS Code
    Also Cursor and Windsurf.

    Zed

    Other
    Writes no editor settings.
```

The flow uses real `select` prompts for choices so the active option is
highlighted, important labels stay prominent, and descriptions render as prompt
hints. It also asks whether to install dependencies and initialize git, explains
each choice, shows a `Ready to create?` summary, and lets the user create or
cancel before files are written. Runtime choices must be ordered Node, Bun.
Starter labels map to existing template IDs: Learn Markless -> `minimal`, Build
an app -> `app`, Write docs -> `docs`, and Full-stack app -> `full-stack`.

The editor prompt comes right after the runtime prompt and decides which editor
settings files the app gets: VS Code -> `.vscode/settings.json` and
`.vscode/extensions.json`, Zed -> `.zed/settings.json`, Other -> neither. Its
preselected answer is detected from the host environment the runtime supplies:
`TERM_PROGRAM=vscode` (set by VS Code, Cursor, and Windsurf terminals) selects
VS Code; `TERM_PROGRAM=zed` or `ZED_TERM=true` (set by Zed's terminal) selects
Zed; anything else selects VS Code. A non-interactive run uses that detected
answer. `--editor <vscode|zed|none>` answers it up front, and any other value is
rejected with the list of valid values. The generated README and the
`Ready to create?` summary name only the chosen editor's files.

Non-interactive flags remain stable for tests and agent-driven setup, including
`--yes`, `--starter`, `--format`, `--editor`, `--no-install`, and `--no-git`.
