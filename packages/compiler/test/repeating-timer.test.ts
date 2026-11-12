import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// The tick of an authored `setInterval` runs as a repeating timer's turn, so the poll it drives refreshes quietly.

async function symbolSources(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Poll.tsrx', source, symbols: [] });
	expect(result.symbolModules.diagnostics).toEqual([]);
	return result.symbolModules.modules
		.filter((module) => module.kind === 'event-handler' || module.kind === 'behavior')
		.map((module) => module.source);
}

const WRAP = 'marklessRepeatingTimer(context, ';
const IMPORT = 'import { marklessRepeatingTimer } from "@markless/web/fns/repeating-timer";';

test('a handler, an attach and a global-qualified call each wrap the interval tick, and a one-off timeout does not', async () => {
	const sources = await symbolSources(`
import { state } from '@markless/core';

export function Poll() @{
	let tick = state(0);
	<div>
		<button onClick={() => { setInterval(() => (tick = tick + 1), 1000); }}>start</button>
		<p attach={() => { const id = window.setInterval(() => { tick = tick + 2; }, 1000); return () => clearInterval(id); }}>{tick}</p>
		<button onClick={() => { globalThis.setInterval(() => (tick = tick + 3), 1000); }}>global</button>
		<input onInput={() => { setTimeout(() => (tick = tick + 4), 300); }} />
	</div>
}
`);
	const holding = (text: string) => sources.find((source) => source.includes(text))!;
	const click = holding('+ 1 })');
	const attach = holding('+ 2 })');
	const global = holding('+ 3 })');
	const debounced = holding('+ 4 })');
	expect(click).toContain(`setInterval(${WRAP}() => context.graph.write(`);
	expect(attach).toContain(`window.setInterval(${WRAP}() => {`);
	expect(global).toContain(`globalThis.setInterval(${WRAP}() => context.graph.write(`);
	for (const wrapped of [click, attach, global]) expect(wrapped).toContain(IMPORT);
	expect(debounced).not.toContain('marklessRepeatingTimer');
});

test('a module that declares its own setInterval keeps every call to it as written', async () => {
	const sources = await symbolSources(`
import { state } from '@markless/core';

function setInterval(run: () => void) {
	run();
}

export function Poll() @{
	let tick = state(0);
	<button onClick={() => { setInterval(() => (tick = tick + 1)); }}>{tick}</button>
}
`);
	expect(sources.join('\n')).not.toContain('marklessRepeatingTimer');
});
