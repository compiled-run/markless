import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

async function behaviorModules(source: string) {
	const result = await compileTsrxModule({
		filename: '/workspace/app/src/Page.tsrx',
		source,
		symbols: [],
	});
	return {
		diagnostics: result.symbolModules.diagnostics.map((diagnostic) => diagnostic.code),
		sources: result.symbolModules.modules
			.filter((module) => module.kind === 'behavior')
			.map((module) => module.source),
	};
}

test('an attach closure calling an imported function carries that import', async () => {
	const { diagnostics, sources } = await behaviorModules(`
import { watch } from '../lib/watch.ts';

export default function Page() @{
	<div attach={(el) => watch(el)}>x</div>
}
`);

	expect(diagnostics).toEqual([]);
	expect(sources).toHaveLength(1);
	expect(sources[0]).toMatch(/import \{ watch \} from ["']\.\.\/lib\/watch\.ts["']/);
});

test('an attach closure carries every import it names and no other', async () => {
	const { diagnostics, sources } = await behaviorModules(`
import observe from './observe.ts';
import { size as measure, unused } from './geometry.ts';
import * as log from './log.ts';

export default function Page() @{
	<section attach={(node) => { log.info(measure(node)); return observe(node); }}>y</section>
}
`);

	expect(diagnostics).toEqual([]);
	expect(sources).toHaveLength(1);
	const source = sources[0]!;
	expect(source).toMatch(/import observe from ["']\.\/observe\.ts["']/);
	expect(source).toMatch(/import \{ size as measure \} from ["']\.\/geometry\.ts["']/);
	expect(source).toMatch(/import \* as log from ["']\.\/log\.ts["']/);
	expect(source).not.toContain('unused');
});
