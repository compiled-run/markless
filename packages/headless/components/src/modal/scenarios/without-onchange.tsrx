import { state } from '@markless/core';
import * as modal from '../index.ts';

// A dialog that passes no onChange at all. It still opens and closes; the count
// beside it proves nothing was called.
export default function WithoutOnChange() @{
	const log = state({ calls: 0 });

	<section>
		<button type="button" data-testid="background">Background</button>
		<modal.root data-testid="root">
			<modal.trigger data-testid="trigger">Preferences</modal.trigger>
			<modal.content data-testid="content">
				<modal.title data-testid="title">Preferences</modal.title>
				<modal.close data-testid="close">Done</modal.close>
			</modal.content>
		</modal.root>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
