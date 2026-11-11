import { storage } from '@markless/core';

export default function LeaveStore() @{
	let left = storage('leave-store-left', 'none');
	let presses = storage('leave-store-presses', '0');

	<section class="leave-store" data-leave-store onNavleave={(event) => {
		left = event.detail;
	}}>
		<p class="leave-text">{'This part keeps what it remembers in the browser storage, so a reload still shows it.'}</p>
		<p class="leave-text">{'Every page renders it in the same place, so an in-place navigation keeps it as it is.'}</p>
		<button type="button" data-store-press onClick={() => (presses = String(Number(presses) + 1))}>{`stored ${presses}`}</button>
		<span data-stored>{left}</span>
	</section>
}
