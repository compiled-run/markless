import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

// A shared() method call is spliced into the handler that makes it, so a computed
// the method reads is a handler read and its value has to travel in the served
// payload. The value can only be written into the payload record its OWNER
// selected: a widget family's factory nodes belong to the widget root, while the
// handler sits on a part beside it. Served from the part, the write found no
// record and vanished, and the resumed method read undefined.
const FAMILY = `
import { computed, shared, state } from '@markless/core';

export const tallyState = shared(() => {
	const board = state({ seed: [] as readonly string[], own: null as readonly string[] | null });
	const marks = computed(() => {
		const own = board.own;
		const seed = board.seed;
		return own === null ? seed : own;
	});
	const label = computed(() => {
		const own = board.own;
		const seed = board.seed;
		return (own === null ? seed : own).join('|');
	});
	return {
		...board,
		marks,
		label,
		addViaComputed(mark: string) {
			const before = marks;
			board.own = before.concat(mark);
		},
		addViaCells(mark: string) {
			const own = board.own;
			const seed = board.seed;
			board.own = (own === null ? seed : own).concat(mark);
		},
	};
}, { scope: 'widget' });

export function TallyRoot({ marks = [] as readonly string[], children }) @{
	const board = tallyState();
	board.seed = marks;

	<div data-tally-root>{children}</div>
}
`;

const READS_COMPUTED = `${FAMILY}
export function TallyArea() @{
	const board = tallyState();

	<div data-tally-area ui-label={board.label} onClick={() => { board.addViaComputed('x'); }} />
}
`;

const READS_CELLS = `${FAMILY}
export function TallyArea() @{
	const board = tallyState();

	<div data-tally-area ui-label={board.label} onClick={() => { board.addViaCells('x'); }} />
}
`;

const MARKS = 'shared:src/tally.tsrx#tallyState/computed:marks';
const LABEL = 'shared:src/tally.tsrx#tallyState/computed:label';

async function compile(source: string) {
	const compiled = await compileTsrxModule({
		filename: 'src/tally.tsrx',
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
	const errors = [
		...compiled.semanticGraph.diagnostics,
		...compiled.stateLowering.diagnostics,
	].filter((diagnostic) => diagnostic.severity === 'error');
	expect(errors).toEqual([]);
	return compiled;
}

/** One emitted SSR component function, sliced out of the module by its header. */
function ssrFunction(source: string, header: string) {
	const start = source.indexOf(header);
	expect(start).toBeGreaterThan(-1);
	const next = source.indexOf('\nasync function markless', start + header.length);
	return source.slice(start, next < 0 ? undefined : next);
}

test('the widget root derives and serves the computed the part-s method reads', async () => {
	const compiled = await compile(READS_COMPUTED);
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';
	const root = ssrFunction(source, 'async function marklessRenderSsr(');

	// The root's own markup names neither computed; it derives `marks` because it
	// owns the payload record the served value has to land in.
	expect(root).toContain(`marklessSsrRenderStateValues.set(${JSON.stringify(MARKS)},`);
	expect(root).toContain(`marklessSsrServeComputed(marklessSsrPayloadState, marklessSsrRenderStateValues, [${JSON.stringify(MARKS)}]);`);
});

test('the part that only renders the same family serves nothing', async () => {
	const compiled = await compile(READS_COMPUTED);
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';
	const area = ssrFunction(source, 'async function marklessRenderSsrTallyArea(');

	// It still derives what its own attribute renders.
	expect(area).toContain(`marklessSsrRenderStateValues.set(${JSON.stringify(LABEL)},`);
	// Its payload selection carries no factory computed, so a serve from here is
	// a write into a record that is not there.
	expect(area).not.toContain('marklessSsrServeComputed(');
});

test('the served computed is one the root-s payload selection carries', async () => {
	const compiled = await compile(READS_COMPUTED);
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';
	const root = ssrFunction(source, 'async function marklessRenderSsr(');
	const selection = /marklessSelectStateNodes\(marklessCloneState\(payloadState\), \[[^\]]*\], \[([^\]]*)\]\)/.exec(
		root,
	);
	const marksIndex = compiled.protocolState.computed.findIndex(
		(computed) => computed.graphNodeId === MARKS,
	);

	expect(marksIndex).toBeGreaterThan(-1);
	expect(selection?.[1]?.split(',').map(Number)).toContain(marksIndex);
});

test('a method that reads only cells moves no served bytes', async () => {
	const compiled = await compile(READS_CELLS);
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';

	expect(source).not.toContain('marklessSsrServeComputed(');
	// And the root still derives nothing its own render never needed.
	expect(ssrFunction(source, 'async function marklessRenderSsr(')).not.toContain(
		`marklessSsrRenderStateValues.set(${JSON.stringify(MARKS)},`,
	);
});
