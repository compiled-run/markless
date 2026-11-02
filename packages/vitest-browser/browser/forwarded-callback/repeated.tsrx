import { state } from '@markless/core';
import { Btn } from './btn.tsrx';

function Swatch({ to }: { readonly to: string }) @{
	const page = state({ last: '' });
	<span>
		<Btn data-pick={to} onClick={() => { page.last = to; }}>{to}</Btn>
		<b data-shown={to}>{page.last}</b>
	</span>
}

function Palette() @{
	const modes = state(['dark', 'light']);
	<div>
		@for (const mode of modes; key mode) {
			<Swatch to={mode} />
		}
	</div>
}

function Lone() @{
	<Btn data-plain="">lone</Btn>
}

export default function Repeated() @{
	<main>
		<Lone />
		<Palette />
	</main>
}
