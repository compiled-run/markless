import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';
import { MARKLESS_WIDGET_INSTANCE_KEY } from '../../src/passes/public-render/residue-reader.ts';

// Two widget families on one page, one rooted inside the other's projection. The
// inner root takes over the plain instance token, so an outer-family handle can
// only mint a correct id from a token filed under its OWN definition.

const source = `
import { element, shared, state } from '@markless/core';

export const nestState = shared(() => {
	const nest = state({ marks: 0 });
	const rootEl = element<HTMLDivElement>();
	return { ...nest, rootEl };
}, { scope: 'widget' });

export const levelState = shared(() => {
	const level = state({ hits: 0, name: '' });
	const contentEl = element<HTMLDivElement>();
	return { ...level, contentEl };
}, { scope: 'widget' });

export function NestRoot({ children }) @{
	const nest = nestState();
	nest.marks = 0;

	<div data-nest-root el={nest.rootEl}>{children}</div>
}

export function NestItem({ name = '', children }) @{
	const level = levelState();
	level.name = name;

	<div data-nest-item data-name={level.name}>{children}</div>
}

export function NestContent({ children }) @{
	const level = levelState();

	<div data-nest-content el={level.contentEl} aria-describedby={level.contentEl}>{children}</div>
}

export default function Page() @{
	<section>
		<NestRoot><NestItem name="a"><NestContent>x</NestContent></NestItem></NestRoot>
	</section>
}
`;

async function compile() {
	return compileTsrxModule({
		filename: 'src/nest.tsrx',
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

function seedChildSource(compiled: Awaited<ReturnType<typeof compile>>) {
	const emitted = compiled.publicRenderModule.ssrModuleSource ?? '';
	const start = emitted.indexOf('seedChild:');
	if (start === -1) return '';
	return emitted.slice(start, emitted.indexOf('renderChild:', start));
}

test('a served widget root files its instance token under every family it roots', async () => {
	const seedChild = seedChildSource(await compile());

	// The plain key stays exactly as it was — it is the fallback a single-family
	// page still reads — and the per-family keys are filed beside it.
	expect(seedChild).toContain(`marklessSsrSeeds.set(${JSON.stringify(MARKLESS_WIDGET_INSTANCE_KEY)},`);
	expect(seedChild).toContain(
		`for(const marklessSsrFamily of marklessSsrWidgetRoots(__marklessSsrComponent0,undefined))marklessSsrSeeds.set(${JSON.stringify(
			MARKLESS_WIDGET_INSTANCE_KEY,
		)}+'|'+marklessSsrFamily,`,
	);
	// Both roots file, so the inner one cannot leave the outer family tokenless.
	expect(seedChild.split("+'|'+marklessSsrFamily").length - 1).toBe(2);
});

test('a minting handle asks for its own family, not the directory its module sits in', async () => {
	const compiled = await compile();
	const handleGraphNodeId =
		compiled.semanticGraph.graphBindings.find((binding) => binding.kind === 'element')?.id ?? '';
	const definitionId = compiled.semanticGraph.sharedDefinitions[0]?.id ?? '';

	// The id the read slices is `<definitionId>/element:<name>` and a definition id
	// carries its module path, so the cut has to be the LAST slash.
	expect(handleGraphNodeId).toBe(`${definitionId}/element:rootEl`);
	expect(handleGraphNodeId.slice(0, handleGraphNodeId.lastIndexOf('/'))).toBe(definitionId);
	expect(handleGraphNodeId.slice(0, handleGraphNodeId.indexOf('/'))).not.toBe(definitionId);

	const emitted = compiled.publicRenderModule.ssrModuleSource ?? '';
	expect(emitted).toContain(".lastIndexOf('/')");
	expect(emitted).not.toContain(".indexOf('/')");
});
