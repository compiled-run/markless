/**
 * The dispatcher (`resume-events.ts`) decides whether a handler body runs as a user action, in one
 * place for every DOM event and every call that event makes, so no event-handler or callback-prop
 * module carries a user-action wrap of its own: a handler that never writes an async input pays
 * nothing for it.
 */
import { expect, test } from 'vitest';
import type { GeneratedSymbolModule, PlannedSymbol } from '../src/artifacts.ts';
import { compileTsrxModule } from '../src/compile-module.ts';
import {
	emitEventHandlerModuleNodes,
	eventHandlerRowLocalNames,
	type EventHandlerEmissionInput,
} from '../src/passes/symbol-modules.ts';

async function printedHandler(
	filename: string,
	source: string,
	pick?: (module: GeneratedSymbolModule) => boolean,
): Promise<string> {
	const result = await compileTsrxModule({ filename, source, symbols: [] });
	const select =
		pick ?? ((module: GeneratedSymbolModule) => module.kind === 'event-handler' || module.kind === 'callback-prop');
	const spliced = result.symbolModules.modules.find(select);
	if (!spliced) throw new Error(`no handler module for ${filename}`);
	const symbol = result.symbolResolver.symbols.find(
		(candidate: PlannedSymbol) => candidate.id === spliced.symbolId,
	);
	if (!symbol || (symbol.kind !== 'event-handler' && symbol.kind !== 'callback-prop')) {
		throw new Error(`no handler symbol for ${filename}`);
	}
	const extracted = result.captureAnalysis.extractedSymbols.find(
		(candidate) => !candidate.loaderSymbolId && candidate.symbolId === symbol.id,
	);
	const captureSlots = (extracted?.captureSlots ?? []).filter((slot) =>
		slot.routes.some((route) => route.componentEdgeId !== undefined),
	);
	const usesArgumentVector = result.captureAnalysis.extractedSymbols.some((candidate) =>
		candidate.captureSlots.some((slot) =>
			slot.routes.some(
				(route) => route.kind === 'callback-route' && route.callbackSymbolId === symbol.id,
			),
		),
	);
	const input: EventHandlerEmissionInput = {
		symbol,
		localNames: eventHandlerRowLocalNames(result.renderData, symbol.id),
		captureSlots,
		usesArgumentVector,
		sourceFileName: filename,
	};
	const emitted = emitEventHandlerModuleNodes(input);
	if (!emitted) throw new Error(`no printed module for ${filename}`);
	return emitted.code;
}

test('a multi-statement event handler carries no user-action wrap', async () => {
	const code = await printedHandler(
		'/workspace/app/src/Form.tsrx',
		`import { state } from '@markless/core';
export function App() @{
	let count = state(0);
	<form onSubmit={(event) => {
		event.preventDefault();
		count = count + 1;
	}}>{count}</form>
}`,
	);

	expect(code).not.toContain('marklessUserAction');
	expect(code).not.toContain('user-action');
});

test('a handler that awaits then writes carries no user-action wrap', async () => {
	const code = await printedHandler(
		'/workspace/app/src/Save.tsrx',
		`import { state } from '@markless/core';
async function saveOrder() {}
export function App() @{
	let reload = state(0);
	<button onClick={async () => {
		await saveOrder();
		reload = reload + 1;
	}}>Save</button>
}`,
	);

	expect(code).not.toContain('marklessUserAction');
	expect(code).not.toContain('user-action');
});

test('a callback prop passed to a child component carries no user-action wrap', async () => {
	const code = await printedHandler(
		'/workspace/app/src/Captures.tsrx',
		`function Child({ label, onTrace }: { label: string; onTrace: (payload: { value: number }, reason: string) => void }) @{
	<button onClick={(event) => onTrace({ value: label.length }, event.type)}>{label}</button>
}
export function App() @{
	<Child label="Save" onTrace={(payload) => console.log(payload.value)} />
}`,
		(module) => module.kind === 'callback-prop',
	);

	expect(code).not.toContain('marklessUserAction');
	expect(code).not.toContain('user-action');
});

test('a scalar-leaf handler carries no user-action wrap', async () => {
	const code = await printedHandler(
		'/workspace/app/src/Counter.tsrx',
		`import { state } from '@markless/core';
export function App() @{
	let weight = state(0);
	<main onClick={() => weight++}>{weight}</main>
}`,
	);

	expect(code).not.toContain('marklessUserAction');
	expect(code).toContain('marklessWriteScalar');
});
