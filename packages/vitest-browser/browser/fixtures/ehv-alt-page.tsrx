import { element } from '@markless/core';
import { AltPoke, AltRoot, AltSurface } from './ehv-alt.tsrx';
import { focusTarget } from './ehv-focus.ts';

export default function EhvAltPage() @{
	const plainRef = element<HTMLElement>();

	<main data-ehv-alt-page>
		<span data-ehv-alt-plain-poke onClick={() => {
			focusTarget('local', plainRef);
		}}>poke plain</span>
		<aside tabindex="-1" data-ehv-alt-plain el={plainRef}>plain</aside>
		<AltRoot>
			<AltPoke />
			<AltSurface />
		</AltRoot>
	</main>
}
