import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

const parts = `
import type { Children } from '@markless/core';
import { state } from '@markless/core';

export function Panel({ children }: { readonly children?: Children }) @{
	let shown = state(true);
	<article>
		<button type="button" onClick={() => (shown = !shown)}>Toggle</button>
		@if (shown) { <div>{children}</div> } @else { <p>Closed</p> }
	</article>
}

export function Shown({ children, open }: { readonly children?: Children; readonly open?: boolean }) @{
	<section>@if (open) { <div>{children}</div> }</section>
}

export function Framed({ children }: { readonly children?: Children }) @{
	<section>@if (children) { <div>{children}</div> } @else { <p>Empty</p> }</section>
}

function Check(props: { readonly label: string }) @{
	<svg aria-label={props.label}><path d="M1 1" /></svg>
}
`;

async function compile(body: string) {
	const result = await compileTsrxModule({
		filename: 'src/page.tsrx',
		source: `${parts}
export default function Page() @{
	let count = state(0);
	${body}
}
`,
		symbols: [],
	});
	return {
		arms: collectTsrxModuleDiagnostics(result).flatMap((diagnostic) =>
			diagnostic.projectionArm
				? [{ code: diagnostic.code, severity: diagnostic.severity, suppressed: diagnostic.suppressed, ...diagnostic.projectionArm }]
				: [],
		),
		projectionArms: result.projectionArms!,
	};
}

test('projection-arms records each arm that holds {children}, with what changes it', async () => {
	const { arms } = await compile('<main />');
	expect(arms).toEqual([
		{ code: 'MARKLESS_PROJECTION_LIVE_IN_BRANCH', severity: 'info', suppressed: undefined, componentName: 'Panel', construct: '@if (shown)', props: null },
		{ code: 'MARKLESS_PROJECTION_LIVE_IN_BRANCH', severity: 'info', suppressed: undefined, componentName: 'Shown', construct: '@if (open)', props: ['open'] },
	]);
});

test('projection-arms says why the children at each call site stay live', async () => {
	const { projectionArms } = await compile(`<main>
		<Panel><button type="button" onClick={() => (count = count + 1)}>Add</button></Panel>
		<Panel><span>Static</span><Check label="ticked" /></Panel>
		<Shown open>Count {count}</Shown>
	</main>`);
	expect(projectionArms.liveChildren).toEqual([
		{ componentEdgeId: 'component-edge:0', reason: 'its <button> handles click' },
		{ componentEdgeId: 'component-edge:1', componentEdgeIds: ['component-edge:2'] },
		{ componentEdgeId: 'component-edge:3', reason: 'it shows `count`, which changes' },
	]);
	expect(projectionArms.components).toEqual(
		expect.arrayContaining([{ componentName: 'Panel', reason: 'its <button> handles click' }]),
	);
	expect(projectionArms.components.some((component) => component.componentName === 'Check')).toBe(false);
});

test('a markless-allow comment above the arm suppresses its record', async () => {
	const result = await compileTsrxModule({
		filename: 'src/pick.tsrx',
		source: `
import type { Children } from '@markless/core';
import { state } from '@markless/core';

export function Pick({ children }: { readonly children?: Children }) @{
	let wide = state(false);
	// markless-allow MARKLESS_PROJECTION_LIVE_IN_BRANCH: the layout is chosen once
	@if (wide) { <div>{children}</div> } @else { <p>{children}</p> }
}
`,
		symbols: [],
	});
	const diagnostics = collectTsrxModuleDiagnostics(result);
	expect(diagnostics.filter((diagnostic) => diagnostic.code.startsWith('MARKLESS_ALLOW'))).toEqual([]);
	expect(diagnostics.find((diagnostic) => diagnostic.projectionArm)).toMatchObject({
		suppressed: true,
		suppressionReason: 'the layout is chosen once',
	});
});
