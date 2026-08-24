import { computed } from '@markless/core';
import { accordion } from '../../index.ts';

// The data lives inside the `computed()` because a module-level const read from
// one is not carried into the lowered symbol. The `<div>` around the loop is
// forced: a construct cannot open directly inside a component tag.
export default function FromData() @{
	const sections = computed(() => [
		{ value: 'alpha', question: 'The first question', answer: 'The first answer.' },
		{ value: 'beta', question: 'The second question', answer: 'The second answer.' },
		{ value: 'gamma', question: 'The third question', answer: 'The third answer.' },
	]);

	<section>
		<accordion.root data-testid="root">
			<div role="presentation" data-testid="rows">
				@for (const section of sections; key section.value) {
					<accordion.item value={section.value} data-testid="row">
						<accordion.itemlabel>
							<accordion.itemtrigger data-testid="row-trigger">
								{section.question}
							</accordion.itemtrigger>
						</accordion.itemlabel>
						<accordion.itemcontent data-testid="row-content">
							{section.answer}
						</accordion.itemcontent>
					</accordion.item>
				}
			</div>
		</accordion.root>
	</section>
}
