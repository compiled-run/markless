import { state } from '@markless/core';

function kindOf(value: unknown, fallback = 'other'): string {
	if (typeof value === 'string') return 'text';
	if (typeof value !== 'number') {
		if (typeof value === 'boolean') return 'flag';
		return fallback;
	}
	return 'number';
}

function firstOf(list: readonly string[]): string {
	return list[0] ?? 'none';
}

export default function Types() @{
	let held = state<unknown>('a');
	let list = state<readonly string[]>([]);
	<main>
		<p>{`Held ${kindOf(held)}`}</p>
		<p>{'string' === typeof held ? 'is text' : 'not text'}</p>
		<p>{`First ${firstOf(list)}, second ${list[1] ?? 'none'}`}</p>
		<button onClick={() => (held = 1)}>Number</button>
		<button onClick={() => (held = true)}>Flag</button>
		<button onClick={() => (held = ['a'])}>List</button>
		<button onClick={() => (held = null)}>Nothing</button>
		<button onClick={() => (list = [...list, list.length === 0 ? 'x' : 'y'])}>Add</button>
	</main>
}
