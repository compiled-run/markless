import { state } from '@markless/core';
import * as menu from '../index.ts';

// The consumer's own handlers, writing into page state the page renders, so what
// the DOM shows is what the callbacks were actually called with and how often.
export default function Controlled() @{
	const log = state({ last: '', calls: 0, open: '', opens: 0 });

	<section style="padding: 40px">
		<button type="button" data-testid="background">Background</button>
		<menu.root
			data-testid="root"
			onChange={(value: string) => {
				log.last = value;
				log.calls = log.calls + 1;
			}}
			onOpenChange={(open: boolean) => {
				log.open = String(open);
				log.opens = log.opens + 1;
			}}
		>
			<menu.trigger data-testid="trigger">Actions</menu.trigger>
			<menu.content data-testid="content">
				<menu.item value="cut" data-testid="item-cut">Cut</menu.item>
				<menu.item value="copy" data-testid="item-copy">Copy</menu.item>
			</menu.content>
		</menu.root>
		<p data-testid="last">{log.last}</p>
		<p data-testid="calls">{log.calls}</p>
		<p data-testid="open">{log.open}</p>
		<p data-testid="opens">{log.opens}</p>
	</section>
}
