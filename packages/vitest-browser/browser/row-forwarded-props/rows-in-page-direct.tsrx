import { state } from '@markless/core';

function Pick({ hue, owner }: { readonly hue: string; readonly owner: string }) @{
	const seen = state({ last: '' });
	<button type="button" data-pick={owner + '-' + hue} onClick={() => { seen.last = owner + ':' + hue; }}>{owner + ' ' + hue + ' -> ' + seen.last}</button>
}

export default function RowsInPageDirect() @{
	const owners = state(['cy', 'di']);
	<main>
		@for (const owner of owners; key owner) {
			<p><Pick hue="dark" owner={owner} /><Pick hue="light" owner={owner} /></p>
		}
	</main>
}
