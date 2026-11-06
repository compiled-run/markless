/**
 * The event-handler emitter (`symbol-modules.ts`'s `buildEventHandlerEmission`) marks every
 * event-handler module's own turn as a user action (submit-quiet-design.md Q2), so a write it
 * makes — including one after an `await` in the same handler — starts a loud refresh, and a
 * write anything else makes (a timer, a socket callback) stays quiet by default.
 *
 * A `callback-prop` symbol (a function passed to a child component, not bound to a DOM event)
 * gets none of this: it inherits whatever user-action context the caller that actually invokes
 * it is running in, so marking it here would double-count or wrongly force it loud.
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

test('a multi-statement event handler marks its own turn as a user action', async () => {
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

	expect(code).toContain('@markless/web/fns/user-action');
	expect(code).toContain('marklessUserActionStart(context)');
	expect(code).toContain('marklessUserActionEnd(context)');
	// The end call sits inside the finally the write it guards shares with entryMarks:
	// an early throw or return still closes the mark.
	expect(code).toMatch(/finally\s*{\s*[^}]*marklessUserActionEnd\(context\);/s);
});

test('a handler that awaits then writes wraps the whole async body, continuation included', async () => {
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

	expect(code).toContain('async function');
	expect(code).toContain('marklessUserActionStart(context)');
	const startIndex = code.indexOf('marklessUserActionStart(context)');
	const tryIndex = code.indexOf('try');
	const awaitIndex = code.indexOf('await ');
	const finallyIndex = code.indexOf('finally');
	const endIndex = code.indexOf('marklessUserActionEnd(context)');
	expect(startIndex).toBeGreaterThan(-1);
	expect(tryIndex).toBeGreaterThan(startIndex);
	expect(awaitIndex).toBeGreaterThan(tryIndex);
	expect(finallyIndex).toBeGreaterThan(awaitIndex);
	expect(endIndex).toBeGreaterThan(finallyIndex);
});

test('a callback prop passed to a child component is not marked here', async () => {
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

	expect(code).not.toContain('marklessUserActionStart');
	expect(code).not.toContain('marklessUserActionEnd');
	expect(code).not.toContain("from '@markless/web/fns/user-action'");
});

test('a scalar-leaf handler is not wrapped here: write-scalar.ts marks it at the write itself', async () => {
	const code = await printedHandler(
		'/workspace/app/src/Counter.tsrx',
		`import { state } from '@markless/core';
export function App() @{
	let weight = state(0);
	<main onClick={() => weight++}>{weight}</main>
}`,
	);

	expect(code).not.toContain('marklessUserActionStart');
	expect(code).not.toContain('marklessUserActionEnd');
	expect(code).toContain('marklessWriteScalar');
});
