import { state } from '@markless/core';

function PlainDuo({ name }: { readonly name: string }) @{
	<span><PlainPick to="dark" name={name} /><PlainPick to="light" name={name} /></span>
}

function PlainPick({ to, name }: { readonly to: string; readonly name: string }) @{
	const page = state({ last: '' });
	<button type="button" data-pick={name + '-' + to} data-last={page.last} onClick={() => { page.last = name + ':' + to; }}>{name + ' ' + to}</button>
}

export default function RowsPropsOnlyInPage() @{
	const groups = state(['one', 'two']);
	<main>
		@for (const group of groups; key group) {
			<PlainDuo name={group} />
		}
	</main>
}
