import { computed, state } from '@markless/core';
import { balanceOf } from './fetch-accounts.ts';

export default function Board() @{
	<main>
		<Tile name="Rent" />
		<Tile name="Food" />
	</main>
}

export function Tile({ name }: { name: string }) @{
	let taps = state(0);
	const value = computed(async () => await balanceOf(name, 1));

	<section data-tile={name}>
		@try {
			<button data-tap onClick={() => taps++}>{value} x{taps}</button>
		} @pending {
			<p>loading</p>
		} @catch {
			<p>broken</p>
		}
	</section>
}
