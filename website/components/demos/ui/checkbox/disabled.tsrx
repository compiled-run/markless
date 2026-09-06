import { checkbox } from '@markless/ui';
import Preview from '../../../ui/preview.tsrx';

export default function CheckboxDisabled({ shows }: { readonly shows: string }) @{
	<Preview shows={shows}>
		<checkbox.root checked disabled style="display:flex; gap:0.7em; align-items:center; opacity:0.55;">
			<checkbox.trigger style="flex:none; display:grid; place-items:center; width:1.5em; height:1.5em; padding:0; border:2px solid var(--code-edge); border-radius:4px; background:var(--paper); color:var(--ink); font:inherit; line-height:1; cursor:not-allowed;">
				<checkbox.indicator>✓</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label>Two factor sign in, set by your administrator</checkbox.label>
		</checkbox.root>
	</Preview>
}
