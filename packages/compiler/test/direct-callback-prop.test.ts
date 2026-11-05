import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { collectSsrPropEvents } from '../src/passes/public-render/component-wiring.ts';

const compile = (filename: string, source: string) =>
	compileTsrxModule({ filename, source, symbols: [] });

const HOST_SOURCE = `import { state } from '@markless/core';
function Key({ to, onPress }: { readonly to: string; readonly onPress?: () => void }) @{
	<button type="button" data-key={to} onClick={onPress}>{to}</button>
}
export default function Page() @{
	const page = state({ last: '' });
	<section>
		<Key to="none" />
		<Key to="dark" onPress={() => { page.last = 'dark'; }} />
		<output>{page.last}</output>
	</section>
}`;

// The collect-elements step of the semantic-graph pass: a received prop handed to a native element is the instance's relay.
test('a received prop handed to a native element is relayed as the instance callback', async () => {
	const result = await compile('src/host-relay.tsrx', HOST_SOURCE);
	const click = result.semanticGraph.events.find((event) => event.eventName === 'click');

	expect(click).toMatchObject({
		handlerSource: '(event) => onPress?.(event)',
		handlerParameters: ['event'],
	});
	const handler = result.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.kind === 'event-handler',
	);
	expect(handler?.captureSlots.flatMap((slot) => slot.routes.map((route) => route.kind))).toEqual(
		['compiler-known-constant', 'callback-route'],
	);
	expect(result.captureAnalysis.diagnostics ?? []).toEqual([]);
});

test('a received prop named event is relayed under a parameter that does not shadow it', async () => {
	const result = await compile(
		'src/event-named.tsrx',
		`function Key({ event }: { readonly event?: () => void }) @{
	<button type="button" onClick={event}>go</button>
}
export default function Page() @{
	<Key event={() => {}} />
}`,
	);

	expect(result.semanticGraph.events[0]).toMatchObject({
		handlerSource: '(domEvent) => event?.(domEvent)',
		handlerParameters: ['domEvent'],
	});
});

test('a received prop that is not a callback still refuses with MARKLESS_CAPTURE_OPAQUE_PROP', async () => {
	const result = await compile(
		'src/opaque-host.tsrx',
		`function Key({ onPress }: { readonly onPress?: () => void }) @{
	<button type="button" onClick={onPress}>go</button>
}
export default function Page() @{
	<Key onPress={window.reportPress} />
}`,
	);

	expect(result.captureAnalysis.diagnostics).toContainEqual(
		expect.objectContaining({
			code: 'MARKLESS_CAPTURE_OPAQUE_PROP',
			propName: 'onPress',
			source: 'window.reportPress',
		}),
	);
});

// The public-render pass: the relay hands the callback its event, so it is not stood in for by the bare callback.
test('a relayed prop event is a wrapping handler, a bare one is not', () => {
	const root = {
		type: 'Element',
		id: { type: 'Identifier', name: 'button' },
		attributes: [
			{
				type: 'Attribute',
				name: { type: 'Identifier', name: 'onClick' },
				value: { type: 'Identifier', name: 'onPress', start: 0, end: 7 },
			},
		],
		children: [],
	};
	const locators = [{ hostNodeId: 'h0', hostPath: [] }];
	const relayed = collectSsrPropEvents(root as never, ['onPress'], 'onPress', locators, [
		{ hostNodeId: 'h0', eventName: 'click', handlerSource: '(event) => onPress?.(event)' },
	]);
	const bare = collectSsrPropEvents(root as never, ['onPress'], 'onPress', locators, [
		{ hostNodeId: 'h0', eventName: 'click', handlerSource: 'onPress' },
	]);

	expect(relayed).toEqual([
		{ hostNodeId: 'h0', eventName: 'click', propName: 'onPress', wraps: true },
	]);
	expect(bare).toEqual([{ hostNodeId: 'h0', eventName: 'click', propName: 'onPress' }]);
});
