import { state } from '@markless/core';

function Pair({ name }: { readonly name: string }) @{
	<span><Choice to="dark" name={name} /><Choice to="light" name={name} /></span>
}

function Choice({ to, name }: { readonly to: string; readonly name: string }) @{
	const page = state({ last: '' });
	<button type="button" data-pick={name + '-' + to} onClick={() => { page.last = to; }}>{name + ' ' + to + ' -> ' + page.last}</button>
}

export default function Nested() @{
	<main><Pair name="one" /><Pair name="two" /></main>
}
