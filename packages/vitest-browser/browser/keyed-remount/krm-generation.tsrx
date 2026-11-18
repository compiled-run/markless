import { computed, state } from '@markless/core';

function Seen({ name }) @{
	let opened = state(false);
	<span data-seen data-open={opened ? 'yes' : 'no'} onClick={() => opened = true}>{name}</span>
}

const NAMES = ['north', 'south', 'east'];

export default function Generation() @{
	let lap = state(0);
	const entries = computed(() => NAMES.map((name) => ({ name, mark: `${lap}:${name}` })));
	<section>
		<button type="button" data-lap onClick={() => lap = lap + 1}>Again</button>
		<ol>
			@for (const entry of entries; key entry.mark) {
				<li data-entry><Seen name={entry.name} /></li>
			}
		</ol>
	</section>
}
