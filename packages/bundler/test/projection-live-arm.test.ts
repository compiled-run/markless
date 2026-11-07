import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'pathe';
import { build as viteBuild } from 'vite';
import { expect, test, vi } from 'vitest';
import { marklessClient } from '../src/rolldown.ts';

// A whole client build per test: about 2 s alone, past 5 s under machine load.
vi.setConfig({ testTimeout: 60_000 });

const root = resolve(import.meta.dirname, '..');
const headless = resolve(root, '../headless/components/src');

const panels = `
import type { Children } from '@markless/core';
import { computed, state } from '@markless/core';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function Panel({ children }: { readonly children?: Children }) @{
	let shown = state(true);
	<article>
		<button type="button" data-toggle onClick={() => (shown = !shown)}>Toggle</button>
		@if (shown) {
			<div data-body>{children}</div>
		} @else {
			<p>Closed</p>
		}
	</article>
}

export function Shown({ children, open }: { readonly children?: Children; readonly open?: boolean }) @{
	<section>
		@if (open) { <div data-body>{children}</div> } @else { <p>Closed</p> }
	</section>
}

export function Framed({ children }: { readonly children?: Children }) @{
	<section>
		@if (children) { <div data-body>{children}</div> } @else { <p>Empty</p> }
	</section>
}

export function Card({ children }: { readonly children?: Children }) @{
	let version = state(0);
	const total = computed(async () => {
		await delay(1);
		return version;
	});
	<section>
		<button type="button" onClick={() => version++}>Reload</button>
		@try {
			<div data-body><h2>{total}</h2>{children}</div>
		} @pending {
			<p>Loading</p>
		}
	</section>
}

export function Counter() @{
	let count = state(0);
	<button type="button" onClick={() => count++}>{count}</button>
}

export function Check(props: { readonly label: string }) @{
	<svg viewBox="0 0 24 24" aria-label={props.label}><path d="M20 6 9 17l-5-5" /></svg>
}
`;

async function buildPage(name: string, files: Readonly<Record<string, string>>) {
	const directory = await mkdtemp(resolve(root, `.projection-arm-${name}-`));
	try {
		for (const [file, source] of Object.entries({ 'panels.tsrx': panels, ...files }))
			await writeFile(resolve(directory, file), source);
		await viteBuild({
			configFile: false,
			root,
			logLevel: 'silent',
			plugins: [marklessClient({ executionLog: 'never', rootDir: root })],
			resolve: { alias: [{ find: /^@markless\/ui$/, replacement: resolve(headless, 'index.ts') }] },
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

const page = (imports: string, body: string) => `
import { state } from '@markless/core';
${imports}

export default function Page() @{
	let count = state(0);
	<main>
		${body}
	</main>
}
`;

const button = `<button type="button" data-projected onClick={() => (count = count + 1)}>Count {count}</button>`;

test('children that handle events, imported into an @if its own state flips, fail the build', async () => {
	await expect(
		buildPage('imported-if', {
			'page.tsrx': page(`import { Panel } from './panels.tsrx';`, `<Panel>${button}</Panel>`),
		}),
	).rejects.toThrow(
		/MARKLESS_PROJECTION_LIVE_IN_BRANCH: <Page> in .*page\.tsrx passes <Panel> children that respond to events or show changing state \(its <button> handles click\), and <Panel> in .*panels\.tsrx renders its children inside @if \(shown\)\. When that arm changes, the browser redraws it from fixed HTML, and the children stop responding\. Move the state into <Panel>, or render \{children\} outside the @if/,
	);
});

test('the same shape written in one file fails the build', async () => {
	await expect(
		buildPage('same-file', {
			'page.tsrx': `${panels}
export default function Page() @{
	let count = state(0);
	<main><Panel>${button}</Panel></main>
}
`,
		}),
	).rejects.toThrow(/MARKLESS_PROJECTION_LIVE_IN_BRANCH: <Page> in .*page\.tsrx passes <Panel> children/);
});

test('children that only show changing state fail the build too', async () => {
	await expect(
		buildPage('reads-state', {
			'page.tsrx': page(`import { Panel } from './panels.tsrx';`, `<Panel><p>Count {count}</p></Panel>`),
		}),
	).rejects.toThrow(/passes <Panel> children .*\(it shows `count`, which changes\)/);
});

test('children inside a @try fail the build', async () => {
	await expect(
		buildPage('try', {
			'page.tsrx': page(`import { Card } from './panels.tsrx';`, `<Card>${button}</Card>`),
		}),
	).rejects.toThrow(
		/MARKLESS_PROJECTION_LIVE_IN_TRY: <Page> in .*page\.tsrx passes <Card> children .*renders its children inside @try\./,
	);
});

test('a component in the children that holds its own state counts as live', async () => {
	await expect(
		buildPage('nested-live', {
			'page.tsrx': page(`import { Counter, Panel } from './panels.tsrx';`, `<Panel><Counter /></Panel>`),
		}),
	).rejects.toThrow(/passes <Panel> children .*\(<Counter> inside them: its <button> handles click\)/);
});

test('children handed through another component are followed to the caller that wrote them', async () => {
	await expect(
		buildPage('forwarded', {
			'middle.tsrx': `
import type { Children } from '@markless/core';
import { Panel } from './panels.tsrx';

export function Middle({ children }: { readonly children?: Children }) @{
	<div><Panel>{children}</Panel></div>
}
`,
			'page.tsrx': page(`import { Middle } from './middle.tsrx';`, `<Middle>${button}</Middle>`),
		}),
	).rejects.toThrow(
		/<Middle> in .*middle\.tsrx passes <Panel> children .*they pass on the children <Page> gives <Middle>, and its <button> handles click/,
	);
});

test('an @if a prop picks fails only where the caller changes that prop', async () => {
	await expect(
		buildPage('fixed-prop', {
			'page.tsrx': page(`import { Shown } from './panels.tsrx';`, `<Shown open>${button}</Shown>`),
		}),
	).resolves.toBeUndefined();
	await expect(
		buildPage('changing-prop', {
			'page.tsrx': page(
				`import { Shown } from './panels.tsrx';`,
				`<Shown open={count > 1}>${button}</Shown>`,
			),
		}),
	).rejects.toThrow(/inside @if \(open\)\. Its test reads the prop `open`, and <Page> in .*page\.tsrx passes it `count > 1`, which changes\./);
});

test('static children, children that pick the arm, and a static component in them all build', async () => {
	await expect(
		buildPage('static', {
			'page.tsrx': page(
				`import { Check, Framed, Panel } from './panels.tsrx';`,
				`<Panel><span>Projected <em>entry</em></span><Check label="ticked" /></Panel>
		<Framed>${button}</Framed>`,
			),
		}),
	).resolves.toBeUndefined();
});

test('a markless-allow comment on an arm that never changes lets live children build', async () => {
	await expect(
		buildPage('allowed', {
			'page.tsrx': `
import type { Children } from '@markless/core';
import { computed, state } from '@markless/core';

function Pick({ children, wide }: { readonly children?: Children; readonly wide?: boolean }) @{
	let seed = state(wide === true);
	const isWide = computed(() => seed);
	// markless-allow MARKLESS_PROJECTION_LIVE_IN_BRANCH: the layout is chosen once and never flips
	@if (isWide) { <div data-wide>{children}</div> } @else { <p data-narrow>{children}</p> }
}

export default function Page() @{
	let count = state(0);
	<main><Pick wide>${button}</Pick></main>
}
`,
		}),
	).resolves.toBeUndefined();
});

test('a headless slider with live children builds', async () => {
	await expect(
		buildPage('slider', {
			'page.tsrx': `
import { state } from '@markless/core';
import { slider } from '@markless/ui';

export default function Page() @{
	let count = state(0);
	<main>
		<slider.root value={40} onChange={() => count++}>
			<slider.label>Volume {count}</slider.label>
			<slider.track><slider.thumb /></slider.track>
		</slider.root>
	</main>
}
`,
		}),
	).resolves.toBeUndefined();
});

test('a headless checkbox indicator holding a component builds', async () => {
	await expect(
		buildPage('checkbox', {
			'page.tsrx': `
import { checkbox } from '@markless/ui';
import { Check } from './panels.tsrx';

export default function Page() @{
	<main>
		<checkbox.root>
			<checkbox.trigger>
				<checkbox.indicator><Check label="ticked" /></checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label>Component off</checkbox.label>
		</checkbox.root>
	</main>
}
`,
		}),
	).resolves.toBeUndefined();
});
