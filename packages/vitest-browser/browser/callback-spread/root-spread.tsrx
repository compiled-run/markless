import { state } from '@markless/core';
import { toggle } from '../../../headless/components/src/index.ts';

function Toggle({ label, ...rest }: { readonly label: string; readonly onChange?: (on: boolean) => void }) @{
	<toggle.root {...rest}>
		<toggle.trigger data-toggle={label}>t</toggle.trigger>
	</toggle.root>
}

export default function RootSpreadPage() @{
	const seen = state({ text: '' });
	<div>
		<Toggle label="one" onChange={() => (seen.text = 'toggle:one')} />
		<Toggle label="two" onChange={() => (seen.text = 'toggle:two')} />
		<Toggle label="none" />
		<span data-seen>{seen.text}</span>
	</div>
}
