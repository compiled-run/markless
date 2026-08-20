import { state } from '@markless/core';

function SameNameLeft() @{
	let report = state(0);
	<button type="button" data-left onClick={() => { report++; }}>{report}</button>
}

function SameNameRight() @{
	let report = state(10);
	<button type="button" data-right onClick={() => { report += 2; }}>{report}</button>
}

export default function SameModuleSameNamePage() @{
	<section data-same-module-same-name>
		<SameNameLeft />
		<SameNameRight />
	</section>
}
