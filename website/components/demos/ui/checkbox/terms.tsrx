import { checkbox } from '@markless/ui';

export default function Terms() @{
	<checkbox.root checked name="terms" style="display:flex; gap:0.7em; align-items:center;">
		<checkbox.trigger style="flex:none; display:grid; place-items:center; width:1.5em; height:1.5em; padding:0; border:2px solid var(--code-edge); border-radius:4px; background:var(--paper); color:var(--ink); font:inherit; line-height:1; cursor:pointer;">
			<checkbox.indicator>✓</checkbox.indicator>
		</checkbox.trigger>
		<checkbox.label style="font-weight:700; cursor:pointer;">I have read the terms</checkbox.label>
	</checkbox.root>
}
