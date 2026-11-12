import { computed } from '@markless/core';
import { addItem } from '../mutations-refresh/server.ts';

// A control that saves beside a value of its own that loads at once, like a button in a page's shell.
export function SoloSave() @{
	const ready = computed(async () => await Promise.resolve('ready'));

	<div>
		<button type="button" data-solo onClick={async () => await addItem('Solo')}>Save</button>
		@try {
			<span data-ready>{ready}</span>
		} @pending {
			<span>Loading</span>
		}
	</div>
}
