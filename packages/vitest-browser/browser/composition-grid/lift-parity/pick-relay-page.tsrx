import { state } from '@markless/core';
import PickRelayMiddle from './pick-relay-middle.tsrx';

export default function PickRelayPage() @{
	let picked = state('none');

	<main>
		<p data-g="picked">{picked}</p>
		<PickRelayMiddle onPick={(id) => (picked = id)} />
	</main>
}
