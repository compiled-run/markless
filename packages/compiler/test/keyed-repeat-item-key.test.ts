import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// Pass `tsrx-semantic-graph` -> `render-data` -> `protocol-view`. `key row` and
// `key i` both leave an EMPTY key path, so the artifact has to say which one it
// is; without that, a list of scalars reads as position-keyed and every row of
// it collapses onto one instance.
async function compileRepeat(keyExpression: string, header = 'const row of rows') {
	return compileTsrxModule({
		filename: 'src/rows.tsrx',
		source: `import { state } from '@markless/core';
export default function Rows() @{
	let rows = state(['lettuce', 'tomato']);

	<section>
		@for (${header}; key ${keyExpression}) {
			<div data-row={row}><button onClick={() => { rows = [...rows]; }}>{row}</button></div>
		}
	</section>
}`,
		symbols: [],
	});
}

test('the item itself as the key is an empty key path that is not an index key', async () => {
	const compiled = await compileRepeat('row');
	const repeat = compiled.semanticGraph.keyedRepeats[0]!;

	expect(repeat.keySource).toBe('row');
	expect(repeat.keyPath).toEqual([]);
	expect(repeat.indexKey).toBeUndefined();
	expect(compiled.renderData?.repeats[0]?.indexKey).toBeUndefined();
});

test('a position key carries the marker that separates it from an item key', async () => {
	const compiled = await compileRepeat('index', 'const row of rows; index index');
	const repeat = compiled.semanticGraph.keyedRepeats[0]!;

	expect(repeat.keyPath).toEqual([]);
	expect(repeat.indexKey).toBe(true);
	expect(compiled.renderData?.repeats[0]?.indexKey).toBe(true);
});

test('a field key keeps the path it always had', async () => {
	const compiled = await compileTsrxModule({
		filename: 'src/rows.tsrx',
		source: `import { state } from '@markless/core';
export default function Rows() @{
	let rows = state([{ id: 'a' }]);

	<section>
		@for (const row of rows; key row.id) {
			<div data-row={row.id}><button onClick={() => { rows = [...rows]; }}>{row.id}</button></div>
		}
	</section>
}`,
		symbols: [],
	});
	const repeat = compiled.semanticGraph.keyedRepeats[0]!;

	expect(repeat.keyPath).toEqual(['id']);
	expect(repeat.indexKey).toBeUndefined();
});

// The reading that used to be dropped: a scalar-keyed repeat is resumable, so it
// keeps its keyed-repeat view record.
test('a scalar-keyed repeat still ships a keyed-repeat view record', async () => {
	const compiled = await compileRepeat('row');

	expect(compiled.protocolView.keyedRepeats?.length ?? 0).toBeGreaterThan(0);
	expect(compiled.protocolView.keyedRepeats?.[0]?.keyPath).toEqual([]);
});

test('a position-keyed repeat ships none, because a slot number is not an identity', async () => {
	const compiled = await compileRepeat('index', 'const row of rows; index index');

	expect(compiled.protocolView.keyedRepeats?.length ?? 0).toBe(0);
});
