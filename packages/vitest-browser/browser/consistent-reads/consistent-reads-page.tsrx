import { computed, state } from '@markless/core';
import { fullName, shout } from './format.ts';
import * as format from './format.ts';

function initials(person: { first: string; last: string }) {
	return person.first[0] + person.last[0];
}

export default function ConsistentReads() @{
	let user = state({ first: 'Ada', last: 'Lovelace' });
	let prof = state({ profile: { name: 'ada' } });
	let names = state({ u1: { name: 'Ada' }, u2: { name: 'Bo' } } as Record<string, { name: string }>);
	let sel = state('u1');
	let count = state(0);
	let op = state('inc');
	const picked = computed(() => names[sel].name + '!');
	const actions = { inc: () => { count++; }, dec: () => { count--; } } as Record<string, () => void>;
	<main>
		<output data-named title={fullName(user)}>{fullName(user)}</output>
		<output data-namespace>{format.fullName(user)}</output>
		<output data-local>{initials(user)}</output>
		<output data-deep>{shout(prof.profile)}</output>
		<output data-picked>{picked}</output>
		<output data-template-pick>{names[sel].name}</output>
		<output data-count>{count}</output>
		<button data-rename onClick={() => { user.first = 'Bo'; }}>rename</button>
		<button data-deepen onClick={() => { prof.profile.name = 'cy'; }}>deepen</button>
		<button data-select onClick={() => { sel = 'u2'; }}>select</button>
		<button data-retitle onClick={() => { names.u2.name = 'Cy'; }}>retitle</button>
		<button data-run onClick={() => actions[op]()}>run</button>
		<button data-flip onClick={() => { op = 'dec'; }}>flip</button>
	</main>
}
