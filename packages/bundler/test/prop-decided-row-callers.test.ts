import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'pathe';
import { build as viteBuild } from 'vite';
import { expect, test, vi } from 'vitest';
import { marklessClient } from '../src/rolldown.ts';

// A whole client build per test: about 2 s alone, past 5 s under machine load.
vi.setConfig({ testTimeout: 30_000 });

const root = resolve(import.meta.dirname, '..');

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

// A row holding a component beside an @if over the list's own state is one the browser cannot build after load.
const list = `
import { state } from '@markless/core';
import Chip from './chip.tsrx';

export function List({ marks }) @{
	let open = state(true);
	<ul onClick={() => (open = !open)}>
		@for (const mark of marks; key mark.key) {
			<li>
				@if (open) {
					<b>on</b>
				}
				<Chip label={mark.key} />
			</li>
		}
	</ul>
}

export function Tree({ nodes }) @{
	let open = state(true);
	<ul onClick={() => (open = !open)}>
		@for (const node of nodes; key node.key) {
			<li>
				@if (open) {
					<b>on</b>
				}
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
		for (const [file, source] of Object.entries({
			'chip.tsrx': chip,
			'list.tsrx': list,
			...files,
		}))
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
		/MARKLESS_KEYED_REPEAT_ROW_MINT_UNSUPPORTED: .*list\.tsrx:\d+:\d+: <List>: This @for row holds @if.*The list comes from the prop `marks`, and <Page> in .*page\.tsrx passes it `marks`, which changes\./,
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

const tag = `
export function Tag({ item }) @{
	<p title={item.label.toUpperCase()}>tag</p>
}
`;

test('an expression into an object prop ships while callers pass it a fixed value, and fails when one passes state', async () => {
	await expect(
		buildPage('object-fixed', {
			'tag.tsrx': tag,
			'page.tsrx': `
import { Tag } from './tag.tsrx';

export default function Page() @{
	<main><Tag item={{ label: 'a' }} /></main>
}
`,
		}),
	).resolves.toBeUndefined();
	await expect(
		buildPage('object-changing', {
			'tag.tsrx': tag,
			'page.tsrx': `
import { state } from '@markless/core';
import { Tag } from './tag.tsrx';

export default function Page() @{
	let item = state({ label: 'a' });
	<main>
		<button type="button" onClick={() => (item.label = 'b')}>rename</button>
		<Tag item={item} />
	</main>
}
`,
		}),
	).rejects.toThrow(
		/MARKLESS_TEMPLATE_EXPRESSION_STATIC: .*tag\.tsrx:\d+:\d+: <Tag>: .*It holds only while the prop `item` never changes, and <Page> in .*page\.tsrx passes it `item`, which changes\./,
	);
});

const runs = `
export function Runs({ runs }) @{
	<p>
		@for (const run of runs; key run.id) {
			@if (run.bold) { <b>{run.text}</b> } @else { <>{run.text}</> }
		}
	</p>
}
`;

test('a list of rows that are not one element ships while callers pass it a fixed list, and fails when one passes state', async () => {
	await expect(
		buildPage('runs-fixed', {
			'runs.tsrx': runs,
			'page.tsrx': `
import { Runs } from './runs.tsrx';

export default function Page() @{
	<Runs runs={[{ id: 1, bold: true, text: 'a' }, { id: 2, bold: false, text: 'b' }]} />
}
`,
		}),
	).resolves.toBeUndefined();
	await expect(
		buildPage('runs-changing', {
			'runs.tsrx': runs,
			'page.tsrx': `
import { state } from '@markless/core';
import { Runs } from './runs.tsrx';

export default function Page() @{
	let list = state([{ id: 1, bold: true, text: 'a' }]);
	<main>
		<button type="button" onClick={() => list.push({ id: 2, bold: false, text: 'b' })}>add</button>
		<Runs runs={list} />
	</main>
}
`,
		}),
	).rejects.toThrow(
		/MARKLESS_KEYED_REPEAT_ROW_NOT_ONE_ELEMENT: .*runs\.tsrx:\d+:\d+: <Runs>: .*passes it `list`, which changes\./,
	);
});

const badge = `
export function Badge({ label }) @{
	<span class="badge">{label}</span>
}

export function Icon({ iconClass }) @{
	<svg class={iconClass} viewBox="0 0 1 1"><path d="M0 0"></path></svg>
}

export function IconBadge({ label }) @{
	<span class="badge">{label}<Icon iconClass="w-4" /></span>
}

export function EditLink({ id }) @{
	<a href={\`/x/\${id}/edit\`}>edit</a>
}
`;

const table = `
import { Badge, EditLink, IconBadge } from './badge.tsrx';

export function Table({ rows }) @{
	<ul>
		@for (const row of rows; key row.id) {
			<li><Badge label={row.label} /></li>
		}
	</ul>
}

export function IconTable({ rows }) @{
	<ul>
		@for (const row of rows; key row.id) {
			<li><IconBadge label={row.label} /></li>
		}
	</ul>
}

export function PairTable({ rows }) @{
	<ul>
		@for (const row of rows; key row.id) {
			<li><Badge label={row.label} /><EditLink id={row.id} /></li>
		}
	</ul>
}

export function LinkTable({ rows }) @{
	<ul>
		@for (const row of rows; key row.id) {
			<li><EditLink id={row.id} /></li>
		}
	</ul>
}
`;

test('rows fed by a changing prop build when each row is a component from another file the browser can build', async () => {
	await expect(
		buildPage('row-component', {
			'badge.tsrx': badge,
			'table.tsrx': table,
			'page.tsrx': `
import { state } from '@markless/core';
import { IconTable, LinkTable, PairTable, Table } from './table.tsrx';

export default function Page() @{
	let rows = state([{ id: 'a', label: 'A' }]);
	<main>
		<button type="button" onClick={() => rows.push({ id: 'b', label: 'B' })}>add</button>
		<Table rows={rows} />
		<IconTable rows={rows} />
		<LinkTable rows={rows} />
		<PairTable rows={rows} />
	</main>
}
`,
		}),
	).resolves.toBeUndefined();
});

const pill = `
export default function Pill({ label }) @{
	<span class="pill">{label}</span>
}
`;

const pillTable = (imports: string, tag: string, row: string) => `
import { state } from '@markless/core';
${imports}

export function PillTable({ rows }) @{
	let open = state(true);
	<ul onClick={() => (open = !open)}>
		@for (const row of rows; key row.id) {
			${row.replaceAll('TAG', tag)}
		}
	</ul>
}
`;

const pillPage = `
import { state } from '@markless/core';
import { PillTable } from './pill-table.tsrx';

export default function Page() @{
	let rows = state([{ id: 'a', label: 'A' }]);
	<main>
		<button type="button" onClick={() => rows.push({ id: 'b', label: 'B' })}>add</button>
		<PillTable rows={rows} />
	</main>
}
`;

for (const [name, imports, tag] of [
	['through a barrel', "import { Pill } from './pills.ts';", 'Pill'],
	['as a default import under another local name', "import Tag from './pill.tsrx';", 'Tag'],
] as const) {
	const files = (row: string) => ({
		'pill.tsrx': pill,
		'pills.ts': "export { default as Pill } from './pill.tsrx';\n",
		'pill-table.tsrx': pillTable(imports, tag, row),
		'page.tsrx': pillPage,
	});

	test(`a row component imported ${name} builds in rows fed by a changing prop, and a row that cannot grow names its real cause`, async () => {
		await expect(buildPage(`pill-${tag}`, files('<li><TAG label={row.label} /></li>'))).resolves.toBeUndefined();
		await expect(
			buildPage(`pill-${tag}-if`, files('<li>@if (open) { <b>on</b> }<TAG label={row.label} /></li>')),
		).rejects.toThrow(/<PillTable>: This @for row holds @if/);
	});
}
