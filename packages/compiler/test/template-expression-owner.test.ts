import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A synthetic computed belongs to the component whose expression minted it, so the root never runs a child's derive.
test('an expression prop a child component passes on is owned by that component', async () => {
	const compiled = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: `import { Spread } from './spread.tsrx';

function Bar({ to }: { readonly to: string }) @{
	<Spread class={'toggle-to-' + to} />
}

export default function Page() @{
	<main>
		<Bar to="dark" />
		<Bar to="light" />
	</main>
}`,
		symbols: [],
	});
	const minted = compiled.semanticGraph.graphBindings.filter((binding) =>
		binding.id.startsWith('computed:templateExpression:'),
	);
	expect(minted.length).toBeGreaterThan(0);
	expect(minted.map((binding) => binding.componentName)).toEqual(minted.map(() => 'Bar'));
	const page = compiled.publicRenderModule.componentDefinitions.find(
		(definition) => definition.componentName === 'Page',
	) as { readonly stateGraphNodeIds?: ReadonlyArray<string> } | undefined;
	expect(page?.stateGraphNodeIds ?? []).not.toEqual(expect.arrayContaining([minted[0]!.id]));
});
