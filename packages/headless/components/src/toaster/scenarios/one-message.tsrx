import { computed } from '@markless/core';
import { toaster } from '../../index.ts';

// One message held by the consumer and written out directly, with no repeat
// around it. This is the family's parts on their own: `itemtitle`,
// `itemdescription` and `itemicon` each branch on `children`, so a self-closed
// placement has to render the record's own words and a written-into one has to
// render what was written. Every other scenario here puts its rows inside a
// `@for`, where a component renders nothing, which hides whether the parts
// themselves work.
export default function OneMessage() @{
	const held = computed(
		() =>
			toaster.say([], 'Saved', {
				id: 'save',
				tone: 'success',
				description: 'On disk.',
				duration: Infinity,
			})[0],
	);

	<main>
		<toaster.root data-testid="root">
			<div role="presentation" data-testid="rows">
				<toaster.item toast={held} data-testid="item">
					<toaster.itemicon data-testid="itemicon" />
					<toaster.itemtitle data-testid="itemtitle" />
					<toaster.itemdescription data-testid="itemdescription" />
					<toaster.itemclose data-testid="itemclose" aria-label="Dismiss">×</toaster.itemclose>
				</toaster.item>
			</div>
			<div role="presentation" data-testid="written-rows">
				<toaster.item toast={held} data-testid="written-item">
					<toaster.itemtitle data-testid="written-itemtitle">Written instead</toaster.itemtitle>
				</toaster.item>
			</div>
		</toaster.root>
	</main>
}
