import { state } from '@markless/core';
import * as menu from '../index.ts';

// No trigger at all: the region opens the menu where the pointer is, and the
// surface takes its name from the consumer's `aria-label` because there is no
// trigger to take it from.
export default function Context() @{
	const log = state({ last: '' });

	<section style="padding: 40px">
		<button type="button" data-testid="background">Background</button>
		<menu.root
			data-testid="root"
			onChange={(value: string) => {
				log.last = value;
			}}
		>
			<menu.contextarea data-testid="area">
				<p data-testid="area-text">Right-click anywhere in here.</p>
			</menu.contextarea>
			<menu.content data-testid="content" aria-label="Row actions">
				<menu.item value="open" data-testid="item-open">Open</menu.item>
				<menu.item value="rename" data-testid="item-rename">Rename</menu.item>
				<menu.item value="delete" data-testid="item-delete">Delete</menu.item>
			</menu.content>
		</menu.root>
		<p data-testid="last">{log.last}</p>
	</section>
}
