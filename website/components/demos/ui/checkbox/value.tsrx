import { checkbox } from '@markless/ui';
import Preview from '../../../ui/preview.tsrx';

export default function CheckboxValue({ shows }: { readonly shows: string }) @{
	<Preview shows={shows}>
		<div style="display:grid; gap:0.7em;">
			<checkbox.root style="display:flex; gap:0.7em; align-items:center;">
				<checkbox.trigger style="flex:none; display:grid; place-items:center; width:1.5em; height:1.5em; padding:0; border:2px solid var(--code-edge); border-radius:4px; background:var(--paper); color:var(--ink); font:inherit; line-height:1; cursor:pointer;">
					<checkbox.indicator>✓</checkbox.indicator>
				</checkbox.trigger>
				<checkbox.label style="cursor:pointer;">Send me the weekly digest</checkbox.label>
			</checkbox.root>
			<checkbox.root checked style="display:flex; gap:0.7em; align-items:center;">
				<checkbox.trigger style="flex:none; display:grid; place-items:center; width:1.5em; height:1.5em; padding:0; border:2px solid var(--code-edge); border-radius:4px; background:var(--paper); color:var(--ink); font:inherit; line-height:1; cursor:pointer;">
					<checkbox.indicator>✓</checkbox.indicator>
				</checkbox.trigger>
				<checkbox.label style="cursor:pointer;">Send me release notes</checkbox.label>
			</checkbox.root>
		</div>
	</Preview>
}
