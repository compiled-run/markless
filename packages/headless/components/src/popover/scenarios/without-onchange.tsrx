import { state } from '@markless/core';
import * as popover from '../index.ts';

export default function WithoutOnChange() @{
	const log = state({ calls: 0 });

	<section>
		<button type="button" data-testid="background">Background</button>
		<popover.root data-testid="root">
			<popover.trigger data-testid="trigger">Preferences</popover.trigger>
			<popover.content data-testid="content">
				<popover.title data-testid="title">Preferences</popover.title>
				<popover.close data-testid="close">Done</popover.close>
			</popover.content>
		</popover.root>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
