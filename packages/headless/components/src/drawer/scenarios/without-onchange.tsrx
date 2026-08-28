import { state } from '@markless/core';
import { drawer } from '../../index.ts';

// No `onChange` at all. The drawer still opens, swipes and closes; the counter
// beside it is only here to prove nothing was called.
export default function WithoutOnChange() @{
	const log = state({ calls: 0 });

	<section>
		<button type="button" data-testid="background">Background</button>
		<drawer.root data-testid="root">
			<drawer.trigger data-testid="trigger">Filter results</drawer.trigger>
			<drawer.backdrop data-testid="backdrop">
				<drawer.content data-testid="content">
					<drawer.title data-testid="title">Filter results</drawer.title>
					<drawer.close data-testid="close">Cancel</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
