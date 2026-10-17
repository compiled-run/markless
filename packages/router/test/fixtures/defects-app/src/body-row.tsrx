import { state } from '@markless/core';

export function BodyRow({ onActions }: { readonly onActions: () => void }) @{
	let open = state(false);
	let after = state(0);
	<div>
		<button
			type="button"
			data-body-trigger
			onPointerdown={() => {
				open = !open;
				onActions();
				after = after + 1;
			}}
		>
			toggle
		</button>
		<output data-body-open>{open ? 'open' : 'closed'}</output>
		<output data-body-after>{after}</output>
	</div>;
}
