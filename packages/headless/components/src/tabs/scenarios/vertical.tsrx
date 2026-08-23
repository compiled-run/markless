import * as tabs from '../index.ts';

// Tabs stacked down the side of a page: the up and down arrows walk them, and
// the left and right arrows are somebody else's axis.
export default function Vertical() @{
	<tabs.root orientation="vertical" value="inbox" data-testid="root">
		<tabs.list data-testid="list">
			<tabs.trigger value="inbox" data-testid="inbox-trigger">Inbox</tabs.trigger>
			<tabs.trigger value="drafts" disabled data-testid="drafts-trigger">Drafts</tabs.trigger>
			<tabs.trigger value="sent" data-testid="sent-trigger">Sent</tabs.trigger>
		</tabs.list>
		<tabs.content value="inbox" data-testid="inbox-content">Nothing new.</tabs.content>
		<tabs.content value="drafts" data-testid="drafts-content">One unfinished note.</tabs.content>
		<tabs.content value="sent" data-testid="sent-content">Twelve messages.</tabs.content>
	</tabs.root>
}
