import { toggle } from '../../index.ts';

// The starter a consumer copies: one labelled switch, off to begin with.
export default function Basic() @{
	<toggle.root data-testid="root">
		<toggle.label data-testid="label">Enable notifications</toggle.label>
		<toggle.trigger data-testid="trigger"><toggle.thumb data-testid="thumb" /></toggle.trigger>
	</toggle.root>
}
