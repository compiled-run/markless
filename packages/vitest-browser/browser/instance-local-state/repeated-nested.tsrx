import { state } from '@markless/core';

function Pair({ name }: { readonly name: string }) @{
	<span><Choice to="dark" name={name} /><Choice to="light" name={name} /></span>
}

function Choice({ to, name }: { readonly to: string; readonly name: string }) @{
	const page = state({ last: '' });
	<button type="button" data-group={name} data-pick={to} onClick={() => { page.last = to; }}>{page.last}</button>
}

export default function RepeatedNested() @{
	const groups = state(['one', 'two']);
	<main>
		@for (const group of groups; key group) {
			<Pair name={group} />
		}
	</main>
}
