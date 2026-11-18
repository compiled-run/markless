import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A handler-local `let` that starts as a copy of state and is then reassigned is the
// handler's own variable: reassigning it writes nothing, and the state write that reads
// it afterwards carries the reassigned value.

async function compile(source: string) {
	return compileTsrxModule({ filename: 'src/Player.tsrx', source, symbols: [] });
}

type Compiled = Awaited<ReturnType<typeof compile>>;

function errors(result: Compiled) {
	return [
		...result.semanticGraph.diagnostics,
		...result.stateLowering.diagnostics,
		...result.symbolModules.diagnostics,
	].filter((diagnostic) => diagnostic.severity === 'error');
}

function handlerSource(result: Compiled): string {
	return result.symbolModules.modules.find((module) => module.kind === 'event-handler')!.source;
}

const graphWrites = (source: string) => source.match(/context\.graph\.write\(/g)?.length ?? 0;

test('a reassigned handler let copied from a state cell writes the cell once, with the reassigned value', async () => {
	const result = await compile(`import { state } from '@markless/core';

export function Player() @{
	let playing = state(false);
	<button onClick={() => { let to = playing; to = !to; playing = to; }}>{playing ? 'Playing' : 'Paused'}</button>
}
`);
	expect(errors(result)).toEqual([]);
	const handler = handlerSource(result);
	expect(graphWrites(handler)).toBe(1);
	expect(handler).toContain('to = !to;');
	expect(handler).toMatch(/graphNodeId: "state:playing", path: \[\], value: to/);
	expect(result.semanticGraph.aliases.find((alias) => alias.name === 'to')).toBeUndefined();
});

// Same shape, every name, element and operator changed, and the copy is taken off a field.
test('a reassigned handler let copied from a state field writes the field once, with the reassigned value', async () => {
	const result = await compile(`import { state } from '@markless/core';

export function Volume() @{
	let mixer = state({ level: 3, muted: false });
	<input type="range" onChange={() => { let next = mixer.level; next = next + 1; mixer.level = next; }} />
}
`);
	expect(errors(result)).toEqual([]);
	const handler = handlerSource(result);
	expect(graphWrites(handler)).toBe(1);
	expect(handler).toContain('next = next + 1;');
	expect(handler).toMatch(/graphNodeId: "state:mixer", path: \["level"\], value: next/);
});

// A handler let that is never reassigned still names the state object it holds,
// so a member write through it reaches the cell.
test('an unreassigned handler let holding a state object still writes through', async () => {
	const result = await compile(`import { state } from '@markless/core';

export function Mixer() @{
	let mixer = state({ level: 3, muted: false });
	<button onClick={() => { let target = mixer; target.muted = !target.muted; }}>{mixer.muted ? 'Muted' : 'Live'}</button>
}
`);
	expect(errors(result)).toEqual([]);
	const handler = handlerSource(result);
	expect(graphWrites(handler)).toBe(1);
	expect(handler).toMatch(/graphNodeId: "state:mixer", path: \["muted"\]/);
});
