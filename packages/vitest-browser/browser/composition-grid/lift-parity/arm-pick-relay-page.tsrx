import { state } from '@markless/core';
import ArmPickRelayMiddle from './arm-pick-relay-middle.tsrx';

export default function ArmPickRelayPage() @{
	let picks = state(0);

	<main>
		<p data-g="picks">{picks}</p>
		<ArmPickRelayMiddle onPick={() => picks++} />
	</main>
}
