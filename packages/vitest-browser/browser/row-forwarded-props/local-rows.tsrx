import { state } from '@markless/core';

export function Board({ rows }: { readonly rows: ReadonlyArray<string> }) @{
	<div>
		@for (const row of rows; key row) {
			<Cells tag={row} />
		}
	</div>
}

function Cells({ tag }: { readonly tag: string }) @{
	<p><Cell mode="dark" tag={tag} /><Cell mode="light" tag={tag} /></p>
}

function Cell({ mode, tag }: { readonly mode: string; readonly tag: string }) @{
	const chosen = state({ last: '' });
	<button type="button" data-pick={tag + '-' + mode} onClick={() => { chosen.last = tag + ':' + mode; }}>{tag + ' ' + mode + ' -> ' + chosen.last}</button>
}
