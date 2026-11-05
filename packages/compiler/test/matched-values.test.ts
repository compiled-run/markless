import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const SHOWN_READS_IMPORT = '@markless/web/fns/shown-reads';

async function compile(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	return {
		codes: result.semanticGraph.diagnostics.map((diagnostic) => diagnostic.code),
		handlers: result.symbolModules.modules
			.filter((module) => module.kind === 'event-handler')
			.map((module) => module.source),
		boundaries: result.symbolModules.modules
			.filter((module) => module.kind === 'async-boundary-update')
			.map((module) => module.source),
	};
}

const page = (handlers: string, settled = '<p>{perDay}</p>') => `import { computed, state } from '@markless/core';

export function Report() @{
	let span = state('10d');
	let note = state('');
	let clicks = state(0);
	const revenue = computed(async () => {
		const days = span;
		await null;
		return { total: days === '10d' ? 10 : 30 };
	});
	const perDay = computed(() => revenue.total / (span === '10d' ? 10 : 20));

	<main>
		${handlers}
		@try {
			${settled}
		} @pending {
			<p>Loading</p>
		}
	</main>
}`;

test('a handler reading an async-backed value beside an input reads both as the screen shows them', async () => {
	for (const handler of [
		'<button onClick={() => (note = `${perDay} over ${span}`)}>Share</button>',
		'<button onClick={() => { const pair = [revenue.total, span]; note = pair.join(); }}>Copy</button>',
	]) {
		const { codes, handlers } = await compile(page(handler));
		expect(codes, handler).toEqual([]);
		const emitted = handlers.find((source) => source.includes(SHOWN_READS_IMPORT));
		expect(emitted, handler).toBeDefined();
		expect(emitted, handler).toContain('context = marklessShownReads(context, [');
		expect(emitted, handler).toContain('"state:span"');
	}
});

test('a handler that reads no async-backed value, or writes the input it reads, reads it live', async () => {
	for (const handler of [
		'<button onClick={() => (clicks = clicks + 1)}>+</button>',
		'<button onClick={() => (note = span)}>Copy span</button>',
		'<button onClick={() => (span = span === "10d" ? "20d" : "10d")}>Toggle</button>',
	]) {
		const { codes, handlers } = await compile(page(handler));
		expect(codes, handler).toEqual([]);
		expect(handlers.some((source) => source.includes(SHOWN_READS_IMPORT)), handler).toBe(false);
	}
	const { handlers } = await compile(page('<button onClick={() => (span = `${perDay}`)}>Odd</button>'));
	const emitted = handlers.find((source) => source.includes(SHOWN_READS_IMPORT));
	expect(emitted ?? '').not.toContain('"state:span"');
});

test('a settled arm showing a value over a live input registers its binding, one over async values only does not', async () => {
	const live = await compile(page(''));
	expect(live.boundaries.join('\n')).toContain('marklessBoundaryRecords');
	const settledOnly = await compile(page('', '<p>{revenue.total}</p>'));
	expect(settledOnly.boundaries.join('\n')).not.toContain('marklessBoundaryRecords');
});
