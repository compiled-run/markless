import { ASYNC_BOUNDARY_ARM } from '@markless/serializer';
import { afterEach, expect, test } from 'vitest';
import { compileTsrxModule } from '../../compiler/src/index.ts';
import { renderToStream } from '../src/render-to-stream.ts';

// The server files each async run under the instance path composition names its graph node with,
// so a child whose host prefix differs from that path (projected into a layout, nested, in a row) still streams.

const HELPERS = /from '@markless\/web\/fns\/([^']+)'/g;

type Output = {
	readonly view?: {
		readonly asyncBoundaries?: ReadonlyArray<{
			readonly id: string;
			readonly runnerGraphNodeId?: string;
			readonly initiallyServedArm: number;
		}>;
	};
	readonly state?: {
		readonly computed?: ReadonlyArray<{ readonly graphNodeId: string; readonly snapshot?: { readonly status?: string } }>;
	};
};

type Gate = { readonly label: string; readonly settle: (value: string | Error) => void };
const gates: Gate[] = [];
const gateHost = globalThis as { __streamGate?: (label: string) => Promise<string> };
gateHost.__streamGate = (label) =>
	new Promise((resolve, reject) =>
		gates.push({ label, settle: (value) => (value instanceof Error ? reject(value) : resolve(value)) }),
	);
afterEach(() => void gates.splice(0));

function open(label: string, value: string | Error = `${label} ready`) {
	const index = gates.findIndex((gate) => gate.label === label);
	if (index < 0) throw new Error(`no load waiting for ${label}`);
	gates.splice(index, 1)[0]!.settle(value);
}

async function streamedPage(body: string) {
	const source = `
import { computed } from '@markless/core';
import type { Children } from '@markless/core';
function Frame({ children }: { readonly children?: Children }) @{
	<div class="frame"><aside>Menu</aside>{children}</div>
}
function Tile({ name }: { readonly name: string }) @{
	const answer = computed(async () => globalThis.__streamGate(name));
	@try { <p>{answer}</p> } @pending { <p>Waiting for {name}</p> } @catch (failure) { <p>{(failure as Error).message}</p> }
}
function Column({ name }: { readonly name: string }) @{
	<section><Tile name={name} /></section>
}
function Board() @{
	const lanes = ['east', 'west'];
	<div>@for (const lane of lanes; key lane) { <Tile name={lane} /> }</div>
}
export function Page() @{
	${body}
}
`;
	const compiled = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	const errors = Object.values(compiled).flatMap((artifact) =>
		((artifact as { diagnostics?: ReadonlyArray<{ severity: string; code: string }> })?.diagnostics ?? []).filter(
			(diagnostic) => diagnostic.severity === 'error',
		),
	);
	expect(errors).toEqual([]);
	const ssr = compiled.publicRenderModule.ssrModuleSource.replace(
		HELPERS,
		(_match, helper: string) => `from '${new URL(`../src/fns/${helper}.ts`, import.meta.url).href}'`,
	);
	const loaded = (await import(
		`data:text/javascript;charset=utf-8,${encodeURIComponent(
			[
				`const payloadState = ${JSON.stringify(compiled.protocolState)};`,
				`const payloadView = ${JSON.stringify(compiled.protocolView)};`,
				`const marklessRenderData = ${JSON.stringify(compiled.renderData)};`,
				ssr,
				'export { marklessRenderSsr };',
			].join('\n'),
		)}`
	)) as { readonly marklessRenderSsr: (props: unknown, context: unknown) => Promise<Output> };
	const outputs: Output[] = [];
	const page = {
		async renderSsr(props: unknown, context: unknown) {
			const output = await loaded.marklessRenderSsr(props, context);
			outputs.push(output);
			return output;
		},
	};
	const stream = await renderToStream(page as never, {});
	return { stream, outputs, appends: stream.appends() };
}

const armOf = (output: Output | undefined) =>
	new Map((output?.view?.asyncBoundaries ?? []).map((boundary) => [boundary.id, boundary.initiallyServedArm]));

// Opens the named loads one at a time; each answer must stream as its own append, settling exactly the boundaries waiting on it.
async function revealsInAnswerOrder(
	page: Awaited<ReturnType<typeof streamedPage>>,
	order: ReadonlyArray<{ readonly label: string; readonly arm: number; readonly value?: Error }>,
) {
	const shell = page.outputs.at(-1);
	const pending = [...armOf(shell)].filter(([, arm]) => arm === ASYNC_BOUNDARY_ARM.pending).map(([id]) => id);
	expect(page.stream.pendingArmCount).toBe(order.length);
	expect(pending).toHaveLength(order.length);
	let settled = new Set<string>();
	for (const step of order) {
		open(step.label, step.value);
		const next = await page.appends.next();
		expect(next.done).toBe(false);
		const wave = page.outputs.at(-1);
		const now = new Set(pending.filter((id) => armOf(wave).get(id) !== ASYNC_BOUNDARY_ARM.pending));
		const fresh = [...now].filter((id) => !settled.has(id));
		expect(fresh).toHaveLength(1);
		expect(armOf(wave).get(fresh[0]!)).toBe(step.arm);
		const runner = wave?.view?.asyncBoundaries?.find((boundary) => boundary.id === fresh[0])?.runnerGraphNodeId;
		const status = wave?.state?.computed?.find((entry) => entry.graphNodeId === runner)?.snapshot?.status;
		expect(status).toBe(step.arm === ASYNC_BOUNDARY_ARM.catch ? 'rejected' : 'fulfilled');
		settled = now;
	}
	expect((await page.appends.next()).done).toBe(true);
}

const settles = (label: string) => ({ label, arm: ASYNC_BOUNDARY_ARM.try });

test.each([
	['a child placed in a layout', '<Frame><main><Tile name="sales" /></main></Frame>', ['sales']],
	['a child two components down in a layout', '<Frame><main><Column name="stock" /></main></Frame>', ['stock']],
	['a child beside other component edges', '<main><Column name="spare" /><Tile name="solo" /></main>', ['spare', 'solo']],
	['component rows of a child', '<main><Board /></main>', ['west', 'east']],
])('%s streams its answer from the server', async (_name, body, labels) => {
	const page = await streamedPage(body);
	expect(gates.map((gate) => gate.label).sort()).toEqual([...labels].sort());
	await revealsInAnswerOrder(page, labels.map(settles));
	expect(gates).toEqual([]);
});

test('three siblings in a layout start together and each streams as it answers', async () => {
	const page = await streamedPage(
		'<Frame><main><Tile name="cards" /><Tile name="chart" /><Tile name="latest" /></main></Frame>',
	);
	// Every load is in flight before any answers: the shell went out with all three waiting.
	expect(gates.map((gate) => gate.label).sort()).toEqual(['cards', 'chart', 'latest']);
	await revealsInAnswerOrder(page, [settles('chart'), settles('latest'), settles('cards')]);
});

test('a failed load in a layout child streams its @catch arm', async () => {
	const page = await streamedPage('<Frame><main><Tile name="ledger" /></main></Frame>');
	await revealsInAnswerOrder(page, [
		{ label: 'ledger', arm: ASYNC_BOUNDARY_ARM.catch, value: new Error('ledger is down') },
	]);
});
