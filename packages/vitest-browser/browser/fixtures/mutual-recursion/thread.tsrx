import { state } from '@markless/core';

type Reply = { readonly id: string; readonly text: string; readonly replies: ReadonlyArray<Reply> };

export default function Comment({ item }: { item: Reply }) @{
	let open = state(true);

	<div data-comment>
		<button type="button" data-flip onClick={() => (open = !open)}>{open ? 'open' : 'closed'}</button>
		<span data-text>{item.text}</span>
		<Replies items={item.replies} />
	</div>
}

export function Replies({ items }: { items: ReadonlyArray<Reply> }) @{
	<ul data-inner>
		@for (const reply of items; key reply.id) {
			<li><Comment item={reply} /></li>
		}
	</ul>
}
