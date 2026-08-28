import { state } from '@markless/core';
// Registration is a follow-up unit, so the barrel has no `taglist` export yet.
// This is the same namespace object `import { taglist } from '../../index.ts'`
// will hand back once it does.
import * as taglist from '../index.ts';

// Two of them alive in one document: every handle read, every minted id and every
// instance write has to answer for its OWN widget. The left one takes tags, the
// right one is a display-only row.
export default function TwoTagLists() @{
	const left = state({ tags: ['apple'] as readonly string[] });
	const right = state({ tags: ['x', 'y'] as readonly string[] });
	let leftHeld = state('apple');
	let rightHeld = state('x|y');

	<main>
		<taglist.root
			data-testid="left-root"
			value={left.tags}
			onChange={(next: readonly string[]) => {
				left.tags = next;
				leftHeld = next.join('|');
			}}
		>
			<taglist.label data-testid="left-label">Fruit</taglist.label>
			<div role="presentation" data-testid="left-row">
				@for (const tag of left.tags; key tag) {
					<taglist.item value={tag} data-testid={`left-item-${tag}`}>
						<taglist.itemlabel data-testid={`left-itemlabel-${tag}`} />
						<taglist.itemclose data-testid={`left-itemclose-${tag}`}>×</taglist.itemclose>
					</taglist.item>
				}
			</div>
			<taglist.input data-testid="left-input" />
		</taglist.root>
		<taglist.root
			data-testid="right-root"
			value={right.tags}
			onChange={(next: readonly string[]) => {
				right.tags = next;
				rightHeld = next.join('|');
			}}
		>
			<taglist.label data-testid="right-label">Letters</taglist.label>
			<div role="presentation" data-testid="right-row">
				@for (const tag of right.tags; key tag) {
					<taglist.item value={tag} data-testid={`right-item-${tag}`}>
						<taglist.itemlabel data-testid={`right-itemlabel-${tag}`} />
						<taglist.itemclose data-testid={`right-itemclose-${tag}`}>×</taglist.itemclose>
					</taglist.item>
				}
			</div>
		</taglist.root>
		<output data-testid="left-held">{leftHeld}</output>
		<output data-testid="right-held">{rightHeld}</output>
	</main>
}
