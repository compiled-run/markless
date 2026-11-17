import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'pathe';
import { build as viteBuild } from 'vite';
import { expect, test, vi } from 'vitest';
import { marklessClient } from '../src/rolldown.ts';

// A whole client build per test: about 2 s alone, past 5 s under machine load.
vi.setConfig({ testTimeout: 30_000 });

const root = resolve(import.meta.dirname, '..');

const panel = `
import { state } from '@markless/core';

function Counter() @{
	let count = state(0);
	<button type="button" onClick={() => count++}>{count}</button>
}

export function Panel({ open }) @{
	<section>
		@if (open) {
			<Counter />
		}
	</section>
}
`;

// A child handed children and a function has to run, and the browser cannot render it in the arm.
const refusedPanel = `
import { state } from '@markless/core';

function Line({ children, onPick }) @{
	<li onClick={onPick}>{children}</li>
}

export function Panel({ open }) @{
	let count = state(0);
	<section>
		@if (open) {
			<Line onPick={() => count++}><b>{count}</b></Line>
		}
	</section>
}
`;

async function buildPage(
	name: string,
	files: Readonly<Record<string, string>>,
	panelSource: string = panel,
) {
	const directory = await mkdtemp(resolve(root, `.prop-decided-${name}-`));
	try {
		for (const [file, source] of Object.entries({ 'panel.tsrx': panelSource, ...files }))
			await writeFile(resolve(directory, file), source);
		await viteBuild({
			configFile: false,
			root,
			logLevel: 'silent',
			plugins: [marklessClient({ executionLog: 'never', rootDir: root })],
			build: {
				write: false,
				target: 'es2022',
				rolldownOptions: {
					input: resolve(directory, 'page.tsrx'),
					preserveEntrySignatures: 'exports-only',
				},
			},
		});
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

test('an @if decided by a prop builds when every caller passes a value that never changes', async () => {
	await expect(
		buildPage('fixed', {
			'page.tsrx': `
import { Panel } from './panel.tsrx';

export default function Page() @{
	<main>
		<Panel open={true} />
		<Panel />
	</main>
}
`,
		}),
	).resolves.toBeUndefined();
});

test('the build fails when a caller passes state to the prop that decides an @if no browser render answers', async () => {
	await expect(
		buildPage('changing', {
			'page.tsrx': `
import { state } from '@markless/core';
import { Panel } from './panel.tsrx';

export default function Page() @{
	let shown = state(false);
	<main>
		<button type="button" onClick={() => (shown = !shown)}>toggle</button>
		<Panel open={shown} />
	</main>
}
`,
		}, refusedPanel),
	).rejects.toThrow(
		/MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED: .*panel\.tsrx:\d+:\d+: <Panel>: .*Its test reads the prop `open`, and <Page> in .*page\.tsrx passes it `shown`, which changes\./,
	);
});

test('the build follows a prop handed through another component to the caller that passes state', async () => {
	await expect(
		buildPage('forwarded', {
			'middle.tsrx': `
import { Panel } from './panel.tsrx';

export function Middle({ open }) @{
	<div>
		<Panel open={open} />
	</div>
}
`,
			'page.tsrx': `
import { state } from '@markless/core';
import { Middle } from './middle.tsrx';

export default function Page() @{
	let shown = state(false);
	<main>
		<button type="button" onClick={() => (shown = !shown)}>toggle</button>
		<Middle open={shown} />
	</main>
}
`,
		}, refusedPanel),
	).rejects.toThrow(
		/<Middle> in .*middle\.tsrx hands it its own prop `open`; <Page> in .*page\.tsrx passes it `shown`, which changes\./,
	);
});

test('an @if decided by a prop whose arm the browser renders builds when a caller passes state', async () => {
	await expect(
		buildPage('rendered', {
			'page.tsrx': `
import { state } from '@markless/core';
import { Panel } from './panel.tsrx';

export default function Page() @{
	let shown = state(false);
	<main>
		<button type="button" onClick={() => (shown = !shown)}>toggle</button>
		<Panel open={shown} />
	</main>
}
`,
		}),
	).resolves.toBeUndefined();
});
