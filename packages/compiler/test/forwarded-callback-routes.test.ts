import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { emitSymbolResolverModule } from '../src/passes/symbol-resolver-module.ts';

const asModule = (code: string) => `data:text/javascript,${encodeURIComponent(code)}`;

// A part composed under an instance path invokes its composer's callback by a page-space id;
// running that callback on the part's scoped graph would apply the path a second time.
test('a callback route reached through an instance-scoped graph runs on the page graph', async () => {
	const part = asModule('export function own(context) { return context.capture.invoke("slot", []); }');
	const resolver = emitSymbolResolverModule({
		symbols: [{ id: 'symbol:0', chunk: part, exportName: 'own' }],
		boundSymbols: [
			{
				id: 'bound:symbol%3A0:2/0',
				baseSymbolId: 'symbol:0',
				instancePath: 'c2:c0:',
				componentEdgePath: ['component-edge:2', 'component-edge:0'],
				ancestry: [],
				captureSlots: [
					{
						slotId: 'slot',
						route: { kind: 'callback-route', callbackSymbolId: 'c2:symbol:1', componentEdgeId: 'component-edge:0' },
					},
				],
			},
		],
	});
	const { loadSymbol } = await import(/* @vite-ignore */ asModule(resolver));
	const page = { read: () => undefined };
	const scoped = { ...page, marklessInstancePath: 'c0:', marklessPageGraph: page };
	const invoked: Array<{ readonly symbolId: string; readonly graph: unknown }> = [];
	const symbol = await loadSymbol('bound:symbol%3A0:2/0');
	await symbol({
		graph: scoped,
		invokeSymbol: (symbolId: string, context: { readonly graph: unknown }) => {
			invoked.push({ symbolId, graph: context.graph });
		},
	});

	expect(invoked).toEqual([{ symbolId: 'c0:c2:symbol:1', graph: page }]);
});

const RELAY_SOURCE = `import type { PropsOf } from '@markless/core';
import { state } from '@markless/core';
function Knob({ children, ...rest }: PropsOf<'button'>) @{
	<button {...rest} type="button">{children}</button>
}
function Plain({ onClick, label }: { readonly onClick?: () => void; readonly label: string }) @{
	<button type="button" onClick={() => onClick?.()}>{label}</button>
}
function Relay({ to, onPress }: { readonly to: string; readonly onPress?: () => void }) @{
	<div>
		<Knob data-relay={to} onClick={onPress}>{to}</Knob>
		<Plain label={to} onClick={onPress} />
	</div>
}
export default function Page() @{
	const page = state({ last: '' });
	<section>
		<Relay to="none" />
		<Relay to="dark" onPress={() => { page.last = 'dark'; }} />
		<output>{page.last}</output>
	</section>
}`;

// The collect-components step of the semantic-graph pass: a prop handed on unchanged to a spreading part is a callback of this instance.
test('a received handler handed to a spreading part is bound as a callback of the passing instance', async () => {
	const result = await compileTsrxModule({ filename: 'src/relay.tsrx', source: RELAY_SOURCE, symbols: [] });
	const edges = result.semanticGraph.componentEdges.filter((edge) => edge.parentComponentName === 'Relay');
	const onClick = (child: string) =>
		edges.find((edge) => edge.childComponentName === child)?.props.find((prop) => prop.name === 'onClick');

	expect(onClick('Knob')).toMatchObject({ kind: 'callback', source: '(event) => onPress?.(event)' });
	expect(onClick('Plain')).toMatchObject({ kind: 'graph-reference', path: ['onPress'] });
	expect(result.protocolView.events).toContainEqual(
		expect.objectContaining({
			hostNodeId: 'c0:h0',
			eventName: 'click',
			componentEdgeId: edges.find((edge) => edge.childComponentName === 'Knob')?.id,
		}),
	);
	expect(result.captureAnalysis.diagnostics ?? []).toEqual([]);
});
