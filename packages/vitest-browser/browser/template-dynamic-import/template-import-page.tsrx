import { state } from '@markless/core';

export function TemplateImportPage() @{
	let side = state('north');
	let label = state('none');
	<div>
		<output data-o>{label}</output>
		<output data-side>{side}</output>
		<button data-south onClick={() => { side = 'south'; }}>south</button>
		<button data-load onClick={async () => { const panel = await import(`./panels/${side}-panel.ts`); label = panel.label; }}>load</button>
	</div>
}
