import { state } from '@markless/core';
import { SheetBody, SheetDismiss, SheetRoot } from './cst-sheet.tsrx';

export default function CstPage() @{
	const page = state({ shown: false, dismissals: 0 });

	<main>
		<button
			type="button"
			data-sheet-open
			onClick={() => {
				page.shown = true;
			}}
		>Open</button>
		<SheetRoot
			shown={page.shown}
			onShownChange={(shown: boolean) => {
				page.shown = shown;
				if (shown !== true) page.dismissals = page.dismissals + 1;
			}}
		>
			<SheetBody>
				<p>Sheet</p>
				<SheetDismiss>Dismiss</SheetDismiss>
			</SheetBody>
		</SheetRoot>
		<output data-sheet-dismissals>{page.dismissals}</output>
	</main>
}
