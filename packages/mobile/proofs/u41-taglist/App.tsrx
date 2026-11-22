import { state } from '@markless/core';
import { taglist } from '@markless/ui';

export default function App() @{
	const own = state({ tags: ['tea'] as readonly string[] });
	<main>
		<h1>Pantry</h1>
		<p>{`Tags: ${own.tags.join(', ')}`}</p>
		<taglist.root
			name="topics"
			value={own.tags}
			onChange={(next: readonly string[]) => {
				own.tags = next;
			}}
		>
			<taglist.label>Topics</taglist.label>
			<div role="presentation">
				@for (const tag of own.tags; key tag) {
					<taglist.item value={tag}>
						<taglist.itemlabel />
					</taglist.item>
				}
			</div>
			<taglist.input placeholder="Add a topic" />
		</taglist.root>
	</main>
}
