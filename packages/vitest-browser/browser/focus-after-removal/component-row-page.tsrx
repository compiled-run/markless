import { state } from '@markless/core';
import { RemovalClose, RemovalItem, RemovalRoot } from './removal-family.tsrx';

// The consumer's own keyed repeat over its own array, rows composed of family
// parts - the shape every @markless/ui row family is used in.
export default function FocusAfterRemovalComponentRowPage() @{
	const own = state({ tags: ['red', 'green', 'blue'] as readonly string[] });

	<main data-focus-after-removal="component">
		<RemovalRoot value={own.tags} onChange={(next: readonly string[]) => { own.tags = next; }}>
			{/* A construct may not be the direct child of a component tag. */}
			<div role="presentation">
				@for (const tag of own.tags; key tag) {
					<RemovalItem value={tag}>
						<RemovalClose>x</RemovalClose>
					</RemovalItem>
				}
			</div>
		</RemovalRoot>
	</main>
}
