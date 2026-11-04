import type { Children } from '@markless/core';
import { state } from '@markless/core';
import StarPicker from './imported-palette-props.tsrx';

function Frame({ children }: { readonly children: Children }) @{
	<aside role="dialog">{children}</aside>
}

export default function ChartPage() @{
	let selected = state('rigel');
	<main>
		<output data-current>{selected}</output>
		<Frame>
			<StarPicker selected={selected} onSelect={(name) => selected = name} />
		</Frame>
	</main>
}
