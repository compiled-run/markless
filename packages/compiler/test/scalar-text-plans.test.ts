import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

test.each([
	[
		'Counter',
		'count',
		'<button onClick={() => count++}>Clicked {count} times</button>',
		'Clicked ',
		' times',
	],
	[
		'Meter',
		'level',
		'<section><output>Level: {level} units</output><button onClick={() => level++}>Raise</button></section>',
		'Level: ',
		' units',
	],
])(
	'scalar text plans preserve both static text segments in %s',
	async (name, cell, body, prefix, suffix) => {
		const compiled = await compileTsrxModule({
			filename: `/src/${name}.tsrx`,
			buildId: 'scalar-text',
			resolverId: 'scalar-text',
			symbols: [],
			source: `import { state } from '@markless/core'; export default function ${name}() @{ let ${cell} = state(0); ${body} }`,
		});
		const plan = compiled.runtimeDemandMaps['plain-ssr'].actions[0]?.plan;
		expect(plan).toMatchObject({
			kind: 'scalar',
			cell: `state:${cell}`,
			textUpdates: [{ prefix, suffix }],
		});
		expect(compiled.runtimeDemandMaps.prerender.actions[0]?.plan).toBeUndefined();
	},
);
