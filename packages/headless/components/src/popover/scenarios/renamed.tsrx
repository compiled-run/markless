import { state } from '@markless/core';
import { popover } from '../../index.ts';

// The title's text changes while the surface is open, and the name has to follow it.
export default function Renamed() @{
	const draft = state({ name: 'Share this page' });

	<section>
		<popover.root data-testid="root">
			<popover.trigger data-testid="trigger">Share</popover.trigger>
			<popover.content data-testid="content">
				<popover.title data-testid="title">{draft.name}</popover.title>
				<button
					type="button"
					data-testid="rename"
					onClick={() => {
						draft.name = 'Share this draft';
					}}
				>Rename</button>
				<popover.close data-testid="close">Done</popover.close>
			</popover.content>
		</popover.root>
	</section>
}
