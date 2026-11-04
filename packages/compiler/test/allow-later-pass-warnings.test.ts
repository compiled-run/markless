import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

async function warnings(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Choice.tsrx', source, symbols: [] });
	return collectTsrxModuleDiagnostics(result)
		.filter((diagnostic) => diagnostic.severity === 'warning')
		.map((diagnostic) => [diagnostic.code, diagnostic.suppressed === true]);
}

const choice = (directive: string) => `export function Choice({ options, value }: { options: string[]; value: string }) @{
	const [first] = options;
	<input
		type="radio"
		${directive}
		checked={first === value}
	/>
}
`;

// The static-expression warning comes from state lowering, after the pass that used to read the comments.
test('markless-allow silences a warning a later pass raises, without calling itself stale', async () => {
	expect(
		await warnings(choice('// markless-allow MARKLESS_TEMPLATE_EXPRESSION_STATIC: value is the initial choice')),
	).toEqual([['MARKLESS_TEMPLATE_EXPRESSION_STATIC', true]]);
});

test('a markless-allow that names a warning no pass raised is still stale', async () => {
	expect(await warnings(choice('// markless-allow MARKLESS_REPEAT_KEY_IS_INDEX: nothing here'))).toEqual([
		['MARKLESS_TEMPLATE_EXPRESSION_STATIC', false],
		['MARKLESS_ALLOW_STALE', false],
	]);
});
