import { computed, state } from '@markless/core';
import { slowValue } from '../lib/value.ts';

export default function StreamArmAdopted() @{
	let taps = state(0);
	const user = computed(async () => slowValue('patio11'));

	<main
		attach={(element) => {
			element.setAttribute('data-shell', 'attached');
		}}
		onVisible={() => {}}
	>
		<button class="tap" onClick={() => taps++}>{taps}</button>
		@try {
			<div
				class="profile"
				attach={(element) => {
					element.setAttribute('data-attached', 'yes');
				}}
				onVisible={() => {}}
			>
				{user.text}
			</div>
		} @pending {
			<p class="profile">loading</p>
		} @catch {
			<p class="profile">failed</p>
		}
	</main>
}
