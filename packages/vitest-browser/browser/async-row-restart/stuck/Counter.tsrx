import { computed, state } from '@markless/core';
import { getTotal } from '../gate.ts';
import Box from './Box.tsrx';


export default function Counter({ reload }: { reload: number }) @{
	let n = state(0);
	const value = computed(async () => await getTotal(n + reload));
	const label = computed(() => `total ${value.amount}`);

	<section>
		<Box>
		@try {
			<p class="value">{`$${value.amount}`}</p>
		} @pending {
			<p class="pending">wait</p>
		} @catch {
			<p role="alert">failed</p>
		}
		@try {
			<p class="label">{label}</p>
		} @pending {
			<p>wait</p>
		} @catch {
			<span>failed</span>
		}
		</Box>
		<button class="bump" onClick={() => n++}>bump</button>
	</section>
}
