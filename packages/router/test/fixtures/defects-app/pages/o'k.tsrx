import { state } from '@markless/core';

export default function ApostropheNamePage() @{
	let taps = state(0);
	<main>
		<button data-apostrophe onClick={() => taps++}>{taps}</button>
	</main>;
}
