import { state } from '@markless/core';
import { Btn } from './btn.tsrx';

function Pick({ to }: { readonly to: string }) @{
	const page = state({ last: '' });
	<Btn data-pick={to} onClick={() => { page.last = to; }}>{to + ' -> ' + page.last}</Btn>
}

function Picks() @{
	<span>
		<Pick to="dark" />
		<Pick to="light" />
	</span>
}

function Plain() @{
	<Btn data-plain="">plain</Btn>
}

export default function Forwarded() @{
	<main>
		<Plain />
		<Picks />
	</main>
}
