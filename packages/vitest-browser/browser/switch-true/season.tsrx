import { state } from '@markless/core';

export default function Season() @{
	let month = state(7);
	const winter = () => 1;

	<div>
		@switch (month) {
			@case winter(): {
				<p data-season>winter</p>
			}
			@case 7: {
				<p data-season>summer</p>
			}
		}
	</div>
}
