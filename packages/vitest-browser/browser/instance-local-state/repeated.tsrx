import { state } from '@markless/core';

function Choice({ to, name }: { readonly to: string; readonly name: string }) @{
	const page = state({ last: '' });
	<button type="button" data-group={name} data-pick={to} onClick={() => { page.last = to; }}>{page.last}</button>
}

export default function Repeated() @{
	const groups = state(['one', 'two']);
	<main>
		@for (const group of groups; key group) {
			<span><Choice to="dark" name={group} /><Choice to="light" name={group} /></span>
		}
	</main>
}
