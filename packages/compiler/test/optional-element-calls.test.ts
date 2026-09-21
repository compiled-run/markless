import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';

const filename = '/workspace/website/components/Preference.tsrx';
const compile = (source: string) =>
	compileTsrxModule({ filename, source, symbols: [], omitAuthoredSource: true });

test('optional handle calls retain owning records for object arguments after storage writes', async () => {
	const result = await compile(`
import { element, storage } from '@markless/core';
export function Preference() @{
 let choice = storage('preference', 'first');
 let selected = element<HTMLButtonElement>();
 <button el={selected} onClick={() => { choice = 'second'; selected?.focus({ preventScroll: true }); }}>Choose</button>
}
`);
	const handler = result.symbolResolver.symbols.find((symbol) => symbol.kind === 'event-handler');
	expect(handler?.kind).toBe('event-handler');
	if (handler?.kind !== 'event-handler') throw Error('Missing handler');
	expect(handler.elementHandleCalls).toEqual([
		expect.objectContaining({
			handleName: 'selected',
			method: 'focus',
			source: 'selected?.focus({ preventScroll: true })',
			argumentSources: ['{ preventScroll: true }'],
		}),
	]);
	expect(handler.elementHandleReads).toEqual([]);
	expect(result.symbolModules.diagnostics).toEqual([]);
	const emitted = result.symbolModules.modules.find((module) => module.kind === 'event-handler');
	expect(emitted?.source).toContain(
		'context.getElementHandle("selected")?.focus({ preventScroll: true })',
	);
});

async function emittedHandler(source: string) {
	const result = await compile(source);
	expect(result.symbolModules.diagnostics).toEqual([]);
	const module = result.symbolModules.modules.find((module) => module.kind === 'event-handler');
	if (!module) throw Error('Missing emitted handler');
	const loaded = await import(
		'data:text/javascript;base64,' + Buffer.from(module.source).toString('base64')
	);
	return {
		result,
		source: module.source,
		run: Object.values(loaded)[0] as (context: unknown) => unknown,
	};
}

test('optional object calls preserve receiver, writes, ordered arguments and absent short circuit', async () => {
	const { run } = await emittedHandler(`
import { element, storage, state } from '@markless/core';
export function Preference() @{
 let choice = storage('preference', 'first');
 let distance = state(8);
 let viewport = element<HTMLElement>();
 <div el={viewport} />
 <button onClick={(event) => { const offset = 3; choice = 'next'; viewport?.scrollTo({ top: event.mark('top') + distance + offset, behavior: 'auto', left: event.mark('left') }); }}>Move</button>
}
`);
	for (const mounted of [true, false]) {
		const events: unknown[] = [];
		const element = {
			scrollTo(this: unknown, options: unknown) {
				expect(this).toBe(element);
				events.push(['scroll', options]);
			},
		};
		await run({
			graph: {
				write: (value: unknown) => events.push(['write', value]),
				read: () => {
					events.push('read');
					return 8;
				},
			},
			event: {
				mark: (name: string) => {
					events.push(name);
					return name === 'top' ? 2 : 4;
				},
			},
			getElementHandle: (name: string) => {
				events.push(['lookup', name]);
				return mounted ? element : undefined;
			},
		});
		expect(events[0]).toEqual(['write', expect.objectContaining({ value: 'next' })]);
		expect(events.slice(1)).toEqual(
			mounted
				? [
						['lookup', 'viewport'],
						'top',
						'read',
						'left',
						['scroll', { top: 13, behavior: 'auto', left: 4 }],
					]
				: [['lookup', 'viewport']],
		);
	}
});

test('nested callbacks lower the owning handle and preserve a shadowed local receiver', async () => {
	const { run } = await emittedHandler(`
import { element } from '@markless/core';
export function Preference() @{
 let button = element<HTMLButtonElement>();
 <button el={button} onClick={(event) => {
  [1].forEach(() => button?.focus({ preventScroll: event.flag }));
  [event.other].forEach(button => button?.focus({ preventScroll: event.flag }));
 }}>Focus</button>
}
`);
	const events: unknown[] = [];
	const element = {
		focus(this: unknown, options: unknown) {
			expect(this).toBe(element);
			events.push(['element', options]);
		},
	};
	const other = {
		focus(this: unknown, options: unknown) {
			expect(this).toBe(other);
			events.push(['local', options]);
		},
	};
	await run({
		event: { flag: true, other },
		getElementHandle: (name: string) => {
			events.push(['lookup', name]);
			return element;
		},
	});
	expect(events).toEqual([
		['lookup', 'button'],
		['element', { preventScroll: true }],
		['local', { preventScroll: true }],
	]);
});

test('unsupported computed optional methods retain unresolved-reference diagnostics', async () => {
	const result = await compile(`
import { element } from '@markless/core';
export function Preference() @{
 let control = element<HTMLButtonElement>();
 <button el={control} onClick={(event) => control?.[event.method]({ preventScroll: true })}>Choose</button>
}
`);
	expect(result.symbolModules.diagnostics).toContainEqual(
		expect.objectContaining({ code: 'MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE' }),
	);
});
