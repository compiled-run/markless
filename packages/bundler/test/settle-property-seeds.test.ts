import { resolve } from 'pathe';
import { expect, test } from 'vitest';
import { createMarklessRolldownPlugin } from '../src/rolldown.ts';
import { deriveArmFillPlan, withBuiltPrerenderPage } from '../src/build/prerender.ts';

const root = resolve(import.meta.dirname, '../../..');

test('a settle template carrying property-only members ships its seeds beside the templates', async () => {
	const emission = await withBuiltPrerenderPage(
		{
			entry: resolve(import.meta.dirname, 'fixtures/settle-property-seeds/App.tsrx'),
			serverPlugin: createMarklessRolldownPlugin({
				environment: 'server',
				options: { rootDir: root, dev: false },
			}),
		},
		(page) => deriveArmFillPlan(page),
	);
	expect(emission?.skipped).toEqual([]);
	const script = /<script>\((.*?)\)\(("[^"]*"),(.*?)\)<\/script>/.exec(emission!.html);
	expect(script?.[2]).toBe('"boundary:0"');
	expect(JSON.parse(script![3]!)).toEqual([
		[
			'arm',
			[
				[[0, 0, 0], 'indeterminate'],
				[[0, 1], 'volume'],
			],
		],
		['row', [[[0, 0], 'indeterminate']]],
		['empty', [[[0, 0], 'indeterminate']]],
	]);
});
