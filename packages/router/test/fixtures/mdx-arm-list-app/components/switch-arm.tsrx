import { state } from '@markless/core';

export default function SwitchArm() @{
	let tab = state('home');

	<div>
		<button data-toggle onClick={() => (tab = tab === 'home' ? 'cart' : 'home')}>Switch</button>
		@switch (tab) {
			@case 'cart': {
				let items = state(3);

				<b data-count onClick={() => (items = items + 2)}>{items}</b>
			}
			@default: {
				<p>Home</p>
			}
		}
	</div>
}
