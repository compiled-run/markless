import { state } from '@markless/core';

function Choice({ to, name }: { readonly to: string; readonly name: string }) @{
	const page = state({ last: '' });
	<button type="button" data-pick={name + '-' + to} onClick={() => { page.last = to; }}>{name + ' ' + to + ' -> ' + page.last}</button>
}

export default function Siblings() @{
	<main><Choice to="dark" name="one" /><Choice to="light" name="one" /></main>
}
