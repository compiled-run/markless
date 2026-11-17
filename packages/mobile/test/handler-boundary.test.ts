import { describe, expect, it } from 'vitest';
import { compileTsrxModule, NATIVE_FACT_COLLECTORS } from '@markless/compiler';
import { classifyHandler, type FunctionLoader } from '../src/boundary/classify.ts';

const noModules: FunctionLoader = () => undefined;

async function verdicts(source: string, load: FunctionLoader = noModules) {
	const { semanticGraph } = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source,
		symbols: [],
		nativeFacts: NATIVE_FACT_COLLECTORS,
	});
	return semanticGraph.events.map((event) => classifyHandler(event, 'src/App.tsrx', load));
}

describe('handler boundary classification', () => {
	it('a state write is data today; a local and an `if` are named extensions', async () => {
		const [counter, guarded] = await verdicts(`import { state } from '@markless/core';
export function App() @{
	let count = state(0);
	<div>
	<button onClick={() => count++}>{count}</button>
	<button onClick={() => { const next = count + 1; if (next < 10) count = next; }}>{'Up'}</button>
	</div>
}`);
		expect(counter).toMatchObject({ class: 1, extensions: [], reasons: [] });
		expect(guarded).toMatchObject({ class: 2, extensions: ['control', 'locals'], reasons: [] });
	});

	it('follows a call into a function of the same module and counts what its body needs', async () => {
		const [pure, timer] = await verdicts(`import { state } from '@markless/core';
function bump(value: number) {
	return value * 2;
}
function later(done: () => void) {
	setTimeout(done, 100);
}
export function App() @{
	let count = state(1);
	<div>
	<button onClick={() => (count = bump(count))}>{count}</button>
	<button onClick={() => later(() => count++)}>{'Later'}</button>
	</div>
}`);
		expect(pure).toMatchObject({ class: 2, extensions: ['control', 'ownFunction'] });
		expect(timer?.class).toBe(3);
		expect(timer?.reasons.map((reason) => reason.split(':')[0])).toEqual(['timers']);
		expect(timer?.extensions).toContain('callbackArgs');
	});

	it('the page itself (an event target method, `document`) is general JavaScript bound to the DOM', async () => {
		const [closest, focus] = await verdicts(`import { state } from '@markless/core';
export function App() @{
	let picked = state('');
	<div>
	<ul onClick={(event) => (picked = (event.target as HTMLElement).closest('li')?.id ?? '')}>{picked}</ul>
	<button onClick={() => (picked = document.title)}>{'Title'}</button>
	</div>
}`);
		expect(closest?.class).toBe(3);
		expect(closest?.reasons[0]?.startsWith('browser:')).toBe(true);
		expect(focus?.reasons).toEqual(['browser: a browser global (`document`)']);
	});

	it('a `shared()` method a handler calls is read from its defining module through the loader', async () => {
		const loads: string[] = [];
		const load: FunctionLoader = (from, specifier, name, member) => {
			loads.push(`${specifier}#${name}.${member}`);
			return { file: 'src/toggle.tsrx', parameters: [], body: [{ kind: 'unsupported', construct: 'a call', gap: { kind: 'call', callee: 'setTimeout', origin: { kind: 'global' }, optional: false, arguments: [] } }] };
		};
		const [flip] = await verdicts(
			`import { toggleState } from './toggle.tsrx';
export function App() @{
	const toggle = toggleState();
	<div>
	<button onClick={() => toggle.flip()}>{'Flip'}</button>
	</div>
}`,
			load,
		);
		expect(loads).toEqual(['./toggle.tsrx#toggleState.flip']);
		expect(flip).toMatchObject({ class: 3, extensions: ['sharedMethod'] });
	});
});
