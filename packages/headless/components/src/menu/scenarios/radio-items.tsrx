import { state } from '@markless/core';
import * as menu from '../index.ts';

// `role="group"` with a name of its own is the consumer's markup: it carries one
// attribute and no behaviour, and it is what makes a reader say "1 of 3".
export default function RadioItems() @{
	const log = state({ last: '', calls: 0 });

	<section style="padding: 40px">
		<button type="button" data-testid="background">Background</button>
		<menu.root
			radio
			checked={['name']}
			data-testid="root"
			onChange={(value: string) => {
				log.last = value;
				log.calls = log.calls + 1;
			}}
		>
			<menu.trigger data-testid="trigger">Sort by</menu.trigger>
			<menu.content data-testid="content" aria-label="Sort by">
				<div role="group" aria-label="Sort by" data-testid="group">
					<menu.item value="name" data-testid="item-name">Name</menu.item>
					<menu.item value="date" data-testid="item-date">Date</menu.item>
					<menu.item value="size" data-testid="item-size">Size</menu.item>
				</div>
			</menu.content>
		</menu.root>
		<p data-testid="last">{log.last}</p>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
