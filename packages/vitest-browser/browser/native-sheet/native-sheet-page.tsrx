import { state } from '@markless/core';
import { native } from '@markless/device';

export default function NativeSheetPage() @{
	let open = state(false);
	let closes = state(0);
	<main>
		<p data-closes>Closed by the platform: {closes}</p>
		<button data-open onClick={() => (open = true)}>Choose</button>
		<native.sheet
			open={open}
			onChange={(next) => {
				open = next;
				closes++;
			}}
		>
			<h2>Choose a city</h2>
			<button data-pick onClick={() => (open = false)}>Osaka</button>
		</native.sheet>
	</main>
}
