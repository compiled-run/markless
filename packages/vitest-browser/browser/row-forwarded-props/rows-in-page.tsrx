import { state } from '@markless/core';

function Duo({ owner }: { readonly owner: string }) @{
	<div><Pick hue="dark" owner={owner} /><Pick hue="light" owner={owner} /></div>
}

function Pick({ hue, owner }: { readonly hue: string; readonly owner: string }) @{
	const seen = state({ last: '' });
	<button type="button" data-pick={owner + '-' + hue} onClick={() => { seen.last = owner + ':' + hue; }}>{owner + ' ' + hue + ' -> ' + seen.last}</button>
}

export default function RowsInPage() @{
	const owners = state(['ann', 'bo']);
	<main>
		@for (const owner of owners; key owner) {
			<Duo owner={owner} />
		}
	</main>
}
