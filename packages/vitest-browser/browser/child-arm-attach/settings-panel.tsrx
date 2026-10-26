import { state } from '@markless/core';

export default function SettingsPanel() @{
	let open = state(false);

	<div data-settings>
		<button type="button" data-toggle onClick={() => (open = !open)}>{open ? 'close' : 'open'}</button>
		@if (open) {
			<div data-panel tabindex="-1" attach={(panel) => {
				panel.setAttribute('data-attached', 'yes');
				(panel as HTMLElement).focus();
			}}>
				<p>panel</p>
			</div>
		}
	</div>
}
