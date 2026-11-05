import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { compileTsrxModulesWithInterfaces } from './multi-module-compile-support.ts';

const WHOLE_PROPS = `import { state } from '@markless/core';
function Pad(props: { readonly 'data-pad': string; readonly onClick: () => void }) @{
	<button {...props} type="button">p</button>
}
export default function Page() @{
	const seen = state({ text: '' });
	<div>
		<Pad data-pad="one" onClick={() => (seen.text = 'one')} />
		<span>{seen.text}</span>
	</div>
}
`;

function servedRenderData(source: string) {
	const json = source.replace(/^export const marklessRenderData = /, '').replace(/;$/, '');
	return JSON.parse(json) as { readonly chunks: ReadonlyArray<{ readonly id: string; readonly hosts: ReadonlyArray<{ readonly hostNodeId: string }> }> };
}

test('a whole-props spread carries the props a consumer passes', async () => {
	const result = await compileTsrxModule({ filename: 'src/Page.tsrx', source: WHOLE_PROPS, symbols: [] });
	const pad = result.moduleGraphInterface.render.components.find(
		(component) => component.componentName === 'Pad',
	);

	expect(pad?.spreadHosts).toEqual([
		expect.objectContaining({ hostNodeId: 'h0', tagName: 'button', carriesProps: true, destructuredNames: [] }),
	]);
	expect(result.protocolView?.events).toEqual([
		expect.objectContaining({ hostNodeId: 'c0:h0', eventName: 'click' }),
	]);
});

// The child names nothing on its static button, so only a parent's forwarded record addresses it.
test('render data keeps a props spread host located when only a consumer addresses it', async () => {
	const result = await compileTsrxModule({ filename: 'src/Page.tsrx', source: WHOLE_PROPS, symbols: [] });
	const chunk = servedRenderData(result.publicRenderModule.renderDataModuleSource).chunks.find(
		(candidate) => candidate.id === 'template:Pad',
	);

	expect(chunk?.hosts.map((host) => host.hostNodeId)).toContain('h0');
});

const FAMILY = `import { shared, state } from '@markless/core';
export const flipState = shared(
	() => {
		const flip = state({ on: false });
		return {
			...flip,
			onFlip: undefined as ((on: boolean) => void) | undefined,
			flip() {
				flip.on = flip.on !== true;
				flip.onFlip?.(flip.on);
			},
		};
	},
	{ scope: 'widget' },
);
export function FlipRoot({ onFlip, children, ...rest }) @{
	const flip = flipState();
	flip.onFlip = onFlip;
	<div {...rest}>{children}</div>
}
export function FlipButton({ children }) @{
	const flip = flipState();
	<button type="button" onClick={() => flip.flip()}>{children}</button>
}
`;

async function compileConsumer(consumer: string) {
	const [family, page] = await compileTsrxModulesWithInterfaces([
		{ filename: 'src/flip.tsrx', source: FAMILY, importSource: './flip.tsrx' },
		{ filename: 'src/Page.tsrx', source: consumer },
	]);
	return { family: family!, page: page! };
}

const consumerOf = (signature: string, root: string) => `import { state } from '@markless/core';
import { FlipButton, FlipRoot } from './flip.tsrx';
function Switch(${signature}) @{
	${root}
		<FlipButton>f</FlipButton>
	</FlipRoot>
}
export default function Page() @{
	const seen = state({ text: '' });
	<div>
		<Switch onFlip={(on) => (seen.text = String(on))} />
		<span>{seen.text}</span>
	</div>
}
`;

test('a widget root publishes the props it files into a callback slot', async () => {
	const { family } = await compileConsumer(consumerOf('{ onFlip }', '<FlipRoot onFlip={onFlip}>'));

	expect(
		family.moduleGraphInterface.render.components.find(
			(component) => component.componentName === 'FlipRoot',
		)?.callbackSlotProps,
	).toEqual(['onFlip']);
});

for (const [shape, signature, root, received] of [
	['handed by name', '{ onFlip }', '<FlipRoot onFlip={onFlip}>', 'onFlip'],
	['spread through rest', '{ ...rest }', '<FlipRoot {...rest}>', 'rest.onFlip'],
	['spread whole', 'props', '<FlipRoot {...props}>', 'props.onFlip'],
] as const) {
	test(`a received callback ${shape} onto a widget root becomes the composer's own callback`, async () => {
		const { page } = await compileConsumer(consumerOf(signature, root));
		const rootEdge = page.semanticGraph.componentEdges.find(
			(edge) => edge.childComponentName === 'FlipRoot',
		)!;

		expect(rootEdge.props.find((prop) => prop.name === 'onFlip')).toMatchObject({
			kind: 'callback',
			source: `(value) => ${received}?.(value)`,
		});
		const relay = page.symbolResolver.symbols.find(
			(symbol) => symbol.kind === 'callback-prop' && symbol.componentEdgeId === rootEdge.id,
		);
		expect(relay?.reads).toEqual([
			expect.objectContaining({ graphNodeId: 'prop:props', path: ['onFlip'] }),
		]);
		expect(page.captureAnalysis.diagnostics).toEqual([]);
	});
}

test('a rest binding that took the slot prop out hands the root no callback', async () => {
	const { page } = await compileConsumer(
		consumerOf('{ onFlip: _onFlip, ...rest }', '<FlipRoot {...rest}>'),
	);
	const rootEdge = page.semanticGraph.componentEdges.find(
		(edge) => edge.childComponentName === 'FlipRoot',
	)!;

	expect(rootEdge.props.map((prop) => prop.name)).toEqual(['...rest']);
});

// A child's handler reads a prop its composer only spread onto it: the route continues to the prop the composer received.
test('a capture through a props spread on a component tag routes to the composer', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		symbols: [],
		source: `import { state } from '@markless/core';
function Press({ onPress }: { readonly onPress: () => void }) @{
	<button onClick={() => onPress()}>p</button>
}
function Forward({ ...rest }: { readonly onPress: () => void }) @{
	<Press {...rest} />
}
export default function Page() @{
	const seen = state({ text: '' });
	<div>
		<Forward onPress={() => (seen.text = 'pressed')} />
		<span>{seen.text}</span>
	</div>
}
`,
	});
	const routes = result.captureAnalysis.extractedSymbols
		.flatMap((symbol) => symbol.captureSlots)
		.filter((slot) => slot.propName === 'onPress')
		.flatMap((slot) => slot.routes);

	expect(routes).toEqual([expect.objectContaining({ kind: 'callback-route' })]);
	expect(result.captureAnalysis.diagnostics).toEqual([]);
});
