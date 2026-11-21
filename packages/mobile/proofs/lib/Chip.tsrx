import { state } from '@markless/core';

export default function Chip({ label, ...rest }: { readonly label: string; readonly onClick?: () => void }) @{
	let presses = state(0);
	<button {...rest} onClick={() => presses++}>
		{label} {presses}
	</button>
}
