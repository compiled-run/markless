import { state } from '@markless/core';
import { MenuTrigger } from './menu-trigger.tsrx';

export function MenuRow({ slot, instance, onPicked }: { readonly slot: number; readonly instance: string; readonly onPicked: () => void }) @{
	let presses = state(0);
	<div data-row={slot}>
		<MenuTrigger
			instance={instance}
			onActions={() => {
				presses = presses + 1;
				onPicked();
			}}
		/>
		<output data-presses={slot}>{presses}</output>
	</div>;
}
