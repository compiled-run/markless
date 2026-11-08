import type { Children } from '@markless/core';
import { Palette, ResetDialog } from './arg-dialogs.tsrx';

function Layer({ children }: { readonly children: Children }) @{
	<div role="dialog">{children}</div>
}

export default function CreatePage() @{
	<main>
		<ResetDialog />
		<Layer>
			<Palette />
		</Layer>
	</main>
}
