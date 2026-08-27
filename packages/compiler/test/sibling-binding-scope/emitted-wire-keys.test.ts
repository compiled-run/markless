import { expect, test } from 'vitest';
import { compileModule, errorCodes } from './support.ts';

/**
 * The graph node id is emitted verbatim into generated code and crosses the
 * SSR/resume boundary, so scoping the CONSUMERS of a colliding id must leave the
 * emitted bytes alone. Qualifying the id itself is a protocol change and is not
 * what this fix does.
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

test('the emitted wire keys stay unqualified across sibling parts', async () => {
	const compiled = await compileModule('src/Siblings.tsrx', SIBLINGS);
	const source = emitted(compiled);

	expect(errorCodes(compiled)).toEqual([]);
	expect(source).toContain('"state:s"');
	expect(source).toContain('"computed:label"');
	expect(source).not.toContain('state:Reader');
	expect(source).not.toContain('state:Writer');
	expect(source).not.toContain('computed:Reader');
	expect(source).not.toContain('computed:Writer');
});

test('two compiles of the same sibling module emit the same bytes', async () => {
	const first = await compileModule('src/Siblings.tsrx', SIBLINGS);
	const second = await compileModule('src/Siblings.tsrx', SIBLINGS);

	expect(emitted(second)).toBe(emitted(first));
});
