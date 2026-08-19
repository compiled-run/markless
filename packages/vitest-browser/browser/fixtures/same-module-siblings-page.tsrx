import { state } from '@markless/core';

function SameModuleCounter() @{
	let steps = state(0);
	<button type="button" data-counter onClick={() => { steps++; }}>{steps}</button>
}

export default function SameModuleSiblingsPage() @{
	<section data-same-module-siblings>
		<div data-row="a"><SameModuleCounter /></div>
		<div data-row="b"><SameModuleCounter /></div>
	</section>
}
