import { expect, test } from 'vitest';
import { compileTsrxModule, type ModuleGraphInterfaceArtifact } from '../src/index.ts';
import { componentEdgeGraphRoutes } from '../src/passes/public-render/component-wiring.ts';

// A child reached through a barrel must get the same prop routes as the same
// child imported directly: the barrel only hides the module that declares it.

const trigger = `export default function CheckboxTrigger({ disabled, children }) @{
	<button type="button" disabled={disabled} ui-disabled={disabled}>{children}</button>
}`;

const parentBody = `	let blocked = state(false);
	<main><Part disabled={blocked}>x</Part></main>`;

async function compileChild() {
	return compileTsrxModule({
		filename: 'src/checkbox/checkbox-trigger.tsrx',
		source: trigger,
		symbols: [],
	});
}

function barrelInterface(
	child: ModuleGraphInterfaceArtifact,
): ModuleGraphInterfaceArtifact {
	return {
		passId: 'module-graph-interface',
		filename: 'src/checkbox/index.ts',
		exports: [],
		linkedComponents: [
			{
				exportPath: ['trigger'],
				source: './checkbox/checkbox-trigger.tsrx',
				importKind: 'default',
				componentName: child.render.components[0]?.componentName ?? '',
			},
		],
		render: { version: 1, components: [] },
	};
}

async function compileParent(
	importLine: string,
	tag: string,
	importedModuleInterfaces: Record<string, ModuleGraphInterfaceArtifact>,
) {
	return compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `import { state } from '@markless/core';
${importLine}
export function App() @{
${parentBody.replaceAll('<Part', `<${tag}`).replaceAll('</Part>', `</${tag}>`)}
}`,
		symbols: [],
		importedModuleInterfaces,
	});
}

test('a barrel-reached child edge carries the same prop routes as a direct import', async () => {
	const child = await compileChild();
	const childInterface = child.moduleGraphInterface;

	const direct = await compileParent(
		`import Part from './checkbox/checkbox-trigger.tsrx';`,
		'Part',
		{ './checkbox/checkbox-trigger.tsrx': childInterface },
	);
	const barrel = await compileParent(
		`import * as checkbox from './checkbox/index.ts';`,
		'checkbox.trigger',
		{
			'./checkbox/checkbox-trigger.tsrx': childInterface,
			'./checkbox/index.ts': barrelInterface(childInterface),
		},
	);

	expect(direct.semanticGraph.diagnostics).toEqual([]);
	expect(barrel.semanticGraph.diagnostics).toEqual([]);

	const directEdge = direct.semanticGraph.componentEdges[0];
	const barrelEdge = barrel.semanticGraph.componentEdges[0];
	// Both edges name the component the .tsrx module declares, not the local tag.
	expect(barrelEdge?.childComponentName).toBe(directEdge?.childComponentName);

	const directRoutes = componentEdgeGraphRoutes(directEdge, true);
	expect(directRoutes).toEqual(componentEdgeGraphRoutes(barrelEdge, true));
	expect(directRoutes).toContainEqual({
		name: 'disabled',
		graphNodeId: 'state:blocked',
		path: [],
	});

	// Every prop the child's DOM updates read has a live route on both edges.
	const readNames = child.protocolView.domUpdates.flatMap((update) => {
		if (update.graphNodeId === 'prop:props') return update.path.slice(0, 1);
		return update.graphNodeId.startsWith('prop:')
			? [update.graphNodeId.slice('prop:'.length)]
			: [];
	});
	expect(readNames.filter((name) => name === 'disabled')).toHaveLength(2);
	for (const name of readNames)
		for (const routes of [directRoutes, componentEdgeGraphRoutes(barrelEdge, true)])
			expect(routes.some((route) => route.name === name)).toBe(true);
});
