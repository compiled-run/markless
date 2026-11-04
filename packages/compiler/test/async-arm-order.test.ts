import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const ORDER_CODE = 'MARKLESS_ASYNC_ARM_ORDER';

const wrap = (arms: string) => `import { computed, state } from '@markless/core';

export function Search() @{
	let query = state('');
	const results = computed(async () => {
		const q = query;
		await null;
		return { q };
	});

	<main>
		@try {
			<ul>{results.q}</ul>
		} ${arms}
	</main>
}`;

async function codes(arms: string) {
	const result = await compileTsrxModule({
		filename: 'src/Search.tsrx',
		source: wrap(arms),
		symbols: [],
	});
	return result.semanticGraph.diagnostics.map((diagnostic) => [
		diagnostic.code,
		diagnostic.severity,
	]);
}

test('an @pending written after @catch refuses with the arm-order code', async () => {
	for (const arms of [
		'@catch (error) { <p>{error.message}</p> } @pending { <p>Loading</p> }',
		'@catch { <p>Failed</p> }\n\t\t@pending\n\t\t{ <p>Loading</p> }',
		'@catch { <p>Failed</p> } @pending { <><b>Loading</b><i>soon</i></> }',
	])
		expect(await codes(arms), arms).toContainEqual([ORDER_CODE, 'error']);
});

test('@pending before @catch, or either arm alone, compiles clean', async () => {
	for (const arms of [
		'@pending { <p>Loading</p> } @catch (error) { <p>{error.message}</p> }',
		'@pending { <p>Loading</p> }',
		'@catch { <p>Failed</p> }',
	])
		expect(await codes(arms), arms).toEqual([]);
});

test('prose after an @try that merely mentions pending stays clean', async () => {
	expect(await codes('@catch { <p>Failed</p> } still pending, sorry')).not.toContainEqual([
		ORDER_CODE,
		'error',
	]);
});
