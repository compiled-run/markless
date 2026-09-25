// Per-entrant build, serve and source layout for the redeploy (returning-visitor) measurement.
// Builds bypass each app's `sync --check` step so the shared-helper edit (e2) can change the synced copy.
import { fileURLToPath } from 'node:url';

export const appsDir = fileURLToPath(new URL('../../apps/', import.meta.url));
export const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

const bin = (name) => `node_modules/.bin/${name}`;

export const apps = {
	markless: {
		build: [['pnpm', ['exec', 'vp', 'build']]],
		clean: ['.output', 'node_modules/.vite'],
		serve: (port) => ({
			command: 'node',
			args: ['.output/server/index.mjs'],
			env: { PORT: String(port) },
		}),
		staticDir: '.output/public',
		records: 'pages/records.tsrx',
		settings: 'pages/settings.tsrx',
		shared: 'src/shared',
		badge: {
			file: 'src/t180-badge.tsrx',
			import: "import T180Badge from '../src/t180-badge.tsrx';",
		},
	},
	qwik: {
		build: [
			[bin('vite'), ['build']],
			[bin('vite'), ['build', '-c', 'adapters/vercel-edge/vite.config.ts']],
		],
		clean: ['dist', 'server', '.vercel', 'node_modules/.vite'],
		serve: (port) => ({
			command: 'node',
			args: ['scripts/serve.mjs'],
			env: { PORT: String(port) },
		}),
		staticDir: '.vercel/output/static',
		records: 'src/routes/records/index.tsx',
		settings: 'src/routes/settings/index.tsx',
		shared: 'src/shared',
		badge: {
			file: 'src/components/t180-badge.tsx',
			import: 'import { T180Badge } from "~/components/t180-badge";',
		},
	},
	octane: {
		build: [[bin('vite'), ['build']]],
		clean: ['dist', '.vercel', 'node_modules/.vite'],
		serve: (port) => ({
			command: bin('octane-preview'),
			args: ['--port', String(port), '--strictPort'],
			env: {},
		}),
		staticDir: 'dist/client',
		records: 'src/Records.tsrx',
		settings: 'src/Settings.tsrx',
		shared: 'src/shared',
		badge: {
			file: 'src/T180Badge.tsrx',
			import: "import { T180Badge } from './T180Badge.tsrx';",
		},
	},
	'react-router': {
		build: [[bin('react-router'), ['build']]],
		clean: ['build', '.react-router', '.vercel', 'node_modules/.vite'],
		serve: (port) => ({
			command: 'node',
			args: ['scripts/start.mjs'],
			env: { PORT: String(port) },
		}),
		staticDir: 'build/client',
		records: 'app/routes/records.tsx',
		settings: 'app/routes/settings.tsx',
		shared: 'app/shared',
		badge: {
			file: 'app/components/t180-badge.tsx',
			import: 'import { T180Badge } from "../components/t180-badge";',
		},
	},
	remix3: {
		// No build step: remix/assets compiles and fingerprints client modules inside the production server.
		build: [],
		clean: ['tmp'],
		serve: (port) => ({
			command: 'node',
			args: ['--import', 'remix/node-tsx', 'server.ts'],
			env: { PORT: String(port), NODE_ENV: 'production' },
		}),
		staticDir: null,
		records: 'app/actions/public/records-table.tsx',
		settings: 'app/actions/public/settings-form.tsx',
		shared: 'app/shared',
		badge: {
			file: 'app/actions/public/t180-badge.tsx',
			import: "import { T180Badge } from './t180-badge.tsx'",
		},
	},
	solidstart: {
		build: [[bin('vite'), ['build']]],
		clean: ['.output', '.nitro', '.vercel', 'dist', 'node_modules/.vite'],
		serve: (port) => ({
			command: 'node',
			args: ['.output/server/index.mjs'],
			env: { PORT: String(port) },
		}),
		staticDir: '.output/public',
		records: 'src/routes/records.tsx',
		settings: 'src/routes/settings.tsx',
		shared: 'src/shared',
		badge: {
			file: 'src/components/T180Badge.tsx',
			import: 'import { T180Badge } from "../components/T180Badge";',
		},
	},
	sveltekit: {
		build: [[bin('vite'), ['build']]],
		clean: ['.svelte-kit', '.vercel', 'build', 'node_modules/.vite'],
		serve: (port) => ({
			command: bin('vite'),
			args: ['preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
			env: {},
		}),
		staticDir: '.svelte-kit/output/client',
		records: 'src/routes/records/+page.svelte',
		settings: 'src/routes/settings/+page.svelte',
		shared: 'src/lib/shared',
		badge: {
			file: 'src/lib/T180Badge.svelte',
			import: "import T180Badge from '$lib/T180Badge.svelte';",
		},
	},
	ripple: {
		build: [[bin('vite'), ['build']]],
		clean: ['dist', '.ripple', '.vercel', 'node_modules/.vite'],
		serve: (port) => ({
			command: 'node',
			args: ['dist/server/entry.js'],
			env: { PORT: String(port) },
		}),
		staticDir: 'dist/client',
		records: 'src/pages/records.tsrx',
		settings: 'src/pages/settings.tsrx',
		shared: 'src/shared',
		badge: {
			file: 'src/components/T180Badge.tsrx',
			import: "import { T180Badge } from '../components/T180Badge.tsrx';",
		},
	},
};
apps['qwik-tuned'] = { ...apps.qwik };

export const badgeSource = {
	markless: `import { state } from '@markless/core';

export default function T180Badge() @{
	let on = state(false);

	<button type="button" class="t180-badge" aria-pressed={on ? 'true' : 'false'} onClick={() => (on = !on)}>{on ? 'Starred' : 'Star'}</button>
}
`,
	qwik: `import { component$, useSignal } from "@qwik.dev/core";

export const T180Badge = component$(() => {
  const on = useSignal(false);
  return (
    <button type="button" class="t180-badge" aria-pressed={on.value ? "true" : "false"} onClick$={() => (on.value = !on.value)}>
      {on.value ? "Starred" : "Star"}
    </button>
  );
});
`,
	octane: `import { useState } from 'octane';

export function T180Badge() @{
	const [on, setOn] = useState(false);

	<button type="button" class="t180-badge" aria-pressed={on ? 'true' : 'false'} onClick={() => setOn((value) => !value)}>{on ? 'Starred' : 'Star'}</button>
}
`,
	'react-router': `import { useState } from "react";

export function T180Badge() {
  const [on, setOn] = useState(false);
  return (
    <button type="button" className="t180-badge" aria-pressed={on ? "true" : "false"} onClick={() => setOn((value) => !value)}>
      {on ? "Starred" : "Star"}
    </button>
  );
}
`,
	remix3: `import { on, type Handle } from 'remix/ui'

export function T180Badge(handle: Handle) {
  let pressed = false

  return () => (
    <button
      type="button"
      className="t180-badge"
      aria-pressed={pressed ? 'true' : 'false'}
      mix={on('click', () => {
        pressed = !pressed
        handle.update()
      })}
    >
      {pressed ? 'Starred' : 'Star'}
    </button>
  )
}
`,
	solidstart: `import { createSignal } from "solid-js";

export function T180Badge() {
  const [on, setOn] = createSignal(false);
  return (
    <button type="button" class="t180-badge" aria-pressed={on() ? "true" : "false"} onClick={() => setOn(!on())}>
      {on() ? "Starred" : "Star"}
    </button>
  );
}
`,
	sveltekit: `<script lang="ts">
	let on = $state(false);
</script>

<button type="button" class="t180-badge" aria-pressed={on ? 'true' : 'false'} onclick={() => (on = !on)}>{on ? 'Starred' : 'Star'}</button>
`,
	ripple: `import { track } from 'ripple';

export function T180Badge() @{
	const on = track(false);

	<button type="button" class="t180-badge" aria-pressed={on.value ? 'true' : 'false'} onClick={() => (on.value = !on.value)}>{on.value ? 'Starred' : 'Star'}</button>
}
`,
};
badgeSource['qwik-tuned'] = badgeSource.qwik;
