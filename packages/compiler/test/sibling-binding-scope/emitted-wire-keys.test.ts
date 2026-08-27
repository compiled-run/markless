import { expect, test } from 'vitest';
import { compileModule, errorCodes } from './support.ts';

/**
 * The graph node id is emitted verbatim into generated code and crosses the
 * SSR/resume boundary, so the qualifier is minted only where it is earned: a
 * component-local name that a second component in the module also declares is
 * spelled `kind:Component.name`, and a name only one component declares keeps
 * the bare `kind:name` it has always emitted.
 */

const SIBLINGS = `
import { computed, element, state } from '@markless/core';

function Reader() @{
	const s = state({ tick: 0 });
	const boxEl = element<HTMLDivElement>();
	const label = computed(() => \`\${s.tick}|r\`);

	<div data-label={label} el={boxEl}>reader</div>
}

export default function Writer() @{
	const s = state({ beat: 0 });
	const boxEl = element<HTMLDivElement>();
	const label = computed(() => \`\${s.beat}|w\`);

	<section data-label={label}>
		<div el={boxEl} onClick={() => (s.beat = s.beat + 1)}>writer</div>
		<Reader />
	</section>
}
`;

const DISTINCT = `
import { computed, element, state } from '@markless/core';

function Reader() @{
	const readerCell = state({ tick: 0 });
	const readerEl = element<HTMLDivElement>();
	const readerLabel = computed(() => \`\${readerCell.tick}|r\`);

	<div data-label={readerLabel} el={readerEl}>reader</div>
}

export default function Writer() @{
	const writerCell = state({ beat: 0 });
	const writerEl = element<HTMLDivElement>();
	const writerLabel = computed(() => \`\${writerCell.beat}|w\`);

	<section data-label={writerLabel}>
		<div el={writerEl} onClick={() => (writerCell.beat = writerCell.beat + 1)}>writer</div>
		<Reader />
	</section>
}
`;

function emitted(compiled: Awaited<ReturnType<typeof compileModule>>): string {
	return [
		compiled.publicRenderModule.renderDataModuleSource,
		compiled.publicRenderModule.ssrModuleSource ?? '',
		compiled.symbolModules.modules
			.map((module) => `${module.symbolId}\n${module.source}`)
			.join('\n\n'),
		compiled.symbolResolverModule,
		JSON.stringify(compiled.publicRenderPlan, null, 2),
		JSON.stringify(compiled.protocolState, null, 2),
		JSON.stringify(compiled.protocolView, null, 2),
		JSON.stringify(compiled.payloadScripts, null, 2),
	].join('\n\n');
}

test('a name only one component declares keeps its unqualified wire key', async () => {
	const compiled = await compileModule('src/Distinct.tsrx', DISTINCT);
	const source = emitted(compiled);

	expect(errorCodes(compiled)).toEqual([]);
	expect(source).toContain('"state:readerCell"');
	expect(source).toContain('"state:writerCell"');
	expect(source).toContain('"computed:readerLabel"');
	expect(source).toContain('"computed:writerLabel"');
	expect(source).toContain('"element:readerEl"');
	expect(source).not.toContain('state:Reader.');
	expect(source).not.toContain('state:Writer.');
	expect(source).not.toContain('computed:Reader.');
	expect(source).not.toContain('computed:Writer.');
});

test('a name two sibling parts both declare is qualified by its declaring component', async () => {
	const compiled = await compileModule('src/Siblings.tsrx', SIBLINGS);
	const source = emitted(compiled);

	expect(errorCodes(compiled)).toEqual([]);
	expect(source).toContain('"state:Reader.s"');
	expect(source).toContain('"state:Writer.s"');
	expect(source).toContain('"computed:Reader.label"');
	expect(source).toContain('"computed:Writer.label"');
	expect(source).toContain('"element:Reader.boxEl"');
	expect(source).toContain('"element:Writer.boxEl"');
	expect(source).not.toContain('"state:s"');
	expect(source).not.toContain('"computed:label"');
	expect(source).not.toContain('"element:boxEl"');
});

test('two compiles of the same sibling module emit the same bytes', async () => {
	const first = await compileModule('src/Siblings.tsrx', SIBLINGS);
	const second = await compileModule('src/Siblings.tsrx', SIBLINGS);

	expect(emitted(second)).toBe(emitted(first));
});
