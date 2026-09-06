import { checkbox } from '@markless/ui';
import Preview from '../../../ui/preview.tsrx';

export default function CheckboxHelp({ shows }: { readonly shows: string }) @{
	<Preview shows={shows}>
		<checkbox.root required style="display:grid; grid-template-columns:auto 1fr; gap:0.3em 0.7em; align-items:center; width:min(30rem,100%);">
			<checkbox.trigger style="flex:none; display:grid; place-items:center; width:1.5em; height:1.5em; padding:0; border:2px solid var(--pink); border-radius:4px; background:var(--paper); color:var(--ink); font:inherit; line-height:1; cursor:pointer;">
				<checkbox.indicator>✓</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label style="font-weight:700; cursor:pointer;">I accept the terms</checkbox.label>
			<checkbox.description style="grid-column:2; font-size:var(--step--1); opacity:0.75;">Read them before you tick this.</checkbox.description>
			<checkbox.error style="grid-column:2; font-size:var(--step--1); color:var(--pink); font-weight:700;">Please accept the terms to continue.</checkbox.error>
		</checkbox.root>
	</Preview>
}
