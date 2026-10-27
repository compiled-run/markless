import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'pathe';
import { build as viteBuild } from 'vite';
import { expect, test, vi } from 'vitest';
import { marklessClient } from '../src/rolldown.ts';

// A whole client build per test: about 2 s alone, past 5 s under machine load.
vi.setConfig({ testTimeout: 30_000 });

const root = resolve(import.meta.dirname, '..');

// A row holding a child whose content awaits is one the browser cannot build after load.
const chip = `
import { computed } from '@markless/core';

export default function Chip({ label }) @{
	const text = computed(async () => label);
	<span>
		@try {
			<b>{text}</b>
		} @pending {
			<i>...</i>
		}
	</span>
}
`;

const list = `
import Chip from './chip.tsrx';

export function List({ marks }) @{
	<ul>
		@for (const mark of marks; key mark.key) {
			<li><Chip label={mark.key} /></li>
		}
	</ul>
}

export function Tree({ nodes }) @{
	<ul>
		@for (const node of nodes; key node.key) {
			<li>
				<Chip label={node.key} />
				<Tree nodes={node.children} />
			</li>
		}
	</ul>
}
`;

async function buildPage(name: string, files: Readonly<Record<string, string>>) {
	const directory = await mkdtemp(resolve(root, `.prop-decided-rows-${name}-`));
	try {
		for (const [file, source] of Object.entries({ 'chip.tsrx': chip, 'list.tsrx': list, ...files }))
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

test('rows a browser cannot build ship when every caller passes a list that never changes', async () => {
	await expect(
		buildPage('fixed', {
			'page.tsrx': `
import { List, Tree } from './list.tsrx';

const TREE = [{ key: 'a', children: [{ key: 'b', children: [] }] }];

export default function Page() @{
	<main>
		<List marks={[{ key: 'x' }, { key: 'y' }]} />
		<Tree nodes={TREE} />
	</main>
}
`,
		}),
	).resolves.toBeUndefined();
});

test('the build fails when a caller passes state as the list those rows come from', async () => {
	await expect(
		buildPage('changing', {
			'page.tsrx': `
import { state } from '@markless/core';
import { List } from './list.tsrx';

export default function Page() @{
	let marks = state([{ key: 'x' }]);
	<main>
		<button type="button" onClick={() => marks.push({ key: 'z' })}>add</button>
		<List marks={marks} />
	</main>
}
`,
		}),
	).rejects.toThrow(
		/MARKLESS_KEYED_REPEAT_ROW_MINT_UNSUPPORTED: .*list\.tsrx: <List>: .*The list comes from the prop `marks`, and <Page> in .*page\.tsrx passes it `marks`, which changes\./,
	);
});

test('a list handed down through a row item is followed to the caller that passes state', async () => {
	await expect(
		buildPage('row-item', {
			'page.tsrx': `
import { state } from '@markless/core';
import { Tree } from './list.tsrx';

export default function Page() @{
	let nodes = state([{ key: 'a', children: [] }]);
	<main>
		<button type="button" onClick={() => nodes.push({ key: 'b', children: [] })}>add</button>
		<Tree nodes={nodes} />
	</main>
}
`,
		}),
	).rejects.toThrow(/<Page> in .*page\.tsrx passes it `nodes`, which changes\./);
});
