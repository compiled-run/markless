import { computed, state } from '@markless/core';
import { sizeOf } from './api.ts';

export default function Reader(props: { items: Array<number>; tag: string }) @{
	let seen = state(-1);
	const whole = computed(() => `${props.tag}:${props.items.length}`);
	const size = computed(async () => await sizeOf(props.items));

	<div data-reader={props.tag}>
		<button data-read onClick={() => (seen = props.items.length)}>read</button>
		<p data-seen>{seen}</p>
		<p data-whole>{whole}</p>
		@try {
			<p data-size>{size}</p>
		} @pending {
			<p data-size>loading</p>
		}
	</div>
}
