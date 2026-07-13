import { state } from '@markless/core';
export function SwitchView() @{
	let kind = state('beta');
	<section>@switch (kind) { @case 'alpha': { <p>A</p> } @case 'beta': { <p>B</p> } @default: { <p>Other</p> } }</section>
}
