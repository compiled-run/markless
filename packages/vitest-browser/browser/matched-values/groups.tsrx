import { computed, state } from '@markless/core';
import { answer } from './gates.ts';

const pages = { 1: ['s1', 'l1', 's2'], 2: ['l2', 'l3'] } as Record<number, string[]>;

export function Groups() @{
	let page = state(1);
	let mode = state('all');
	const rows = computed(async () => answer(`rows:${page}`, pages[page]));
	const shown = computed(() => (mode === 'all' ? rows : rows.filter((row) => row.startsWith('s'))).join(' '));

	<div>
		<button type="button" data-next onClick={() => (page = 2)}>Next</button>
		<button type="button" data-small onClick={() => (mode = 'small')}>Small only</button>
		@try {
			<p data-shown>{shown}</p>
		} @pending {
			<p>Loading</p>
		}
	</div>
}
