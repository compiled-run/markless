import { state } from '@markless/core';
export function SpreadAttributes() @{
	const meta = state({ id: 'hero', role: 'note', hidden: false });
	<section data-kind="card" {...meta} title="Stable"><p>Spread attributes</p></section>
}
