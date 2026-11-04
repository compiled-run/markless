import type { Children } from '@markless/core';
import FillPanel from './abr-fill-panel-part.tsrx';

function Frame({ children }: { readonly children?: Children }) @{
	<div data-frame>{children}</div>
}

export default function FillPage() @{
	<main>
		<Frame>
			<FillPanel fill="dim" />
		</Frame>
	</main>
}
