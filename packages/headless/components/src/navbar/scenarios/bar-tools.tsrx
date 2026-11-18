import { storage } from '@markless/core';
import { navbar } from '../../index.ts';

// A header tool authored in its own module, rendered both in a mobile menu and inside the navbar.
export default function BarTools({ name }: { readonly name: string }) @{
	<span>
		<BarLink name={name} />
	</span>
}

function BarLink({ name }: { readonly name: string }) @{
	// oxlint-disable-next-line no-unused-vars -- the write persists the choice
	let theme = storage('scenario-theme', 'system');
	<navbar.itemlink
		href={'#' + name}
		data-testid={name + '-itemlink'}
		onClick={() => {
			theme = 'dark';
		}}
	>
		{name}
	</navbar.itemlink>
}
