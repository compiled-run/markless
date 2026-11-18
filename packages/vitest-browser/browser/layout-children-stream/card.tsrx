import { computed, state } from '@markless/core';
import { load } from './load.ts';

export default function Card({ label, ms }: { readonly label: string; readonly ms: number }) @{
	const text = computed(async () => load(label, ms));
	const tries = state(1);
	<article>
		@try {
			<p data-card>{text}</p>
		} @pending {
			<p data-card-pending>Loading {label}</p>
		} @catch (error) {
			<p data-card-failed>{(error as Error).message} (try {tries})</p>
		}
	</article>
}
