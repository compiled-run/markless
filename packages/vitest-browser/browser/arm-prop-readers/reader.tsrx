import { computed, state } from '@markless/core';
import { load, twice } from './api.ts';

function Leaf({ value }: { value: number }) @{
	<i data-leaf>{value}</i>
}

// Reads one prop every way a component can: text, attribute, @if test, @for, sync and async computeds, a handler, a child's prop.
export default function Reader({ value, list }: { value: number; list: Array<number> }) @{
	let seen = state(-1);
	const doubled = computed(() => twice(value));
	const loaded = computed(async () => await load(value));

	<div data-reader data-value={value}>
		<p data-text>{value}</p>
		@if (value > 1) {
			<b data-big>big</b>
		} @else {
			<b data-big>small</b>
		}
		<ul>
			@for (const item of list; key item) {
				<li>{item}</li>
			}
		</ul>
		<p data-doubled>{doubled}</p>
		@try {
			<p data-loaded>{loaded}</p>
		} @pending {
			<p data-loaded>loading</p>
		}
		<button type="button" data-read onClick={() => (seen = value)}>read</button>
		<p data-seen>{seen}</p>
		<Leaf value={value} />
	</div>
}
