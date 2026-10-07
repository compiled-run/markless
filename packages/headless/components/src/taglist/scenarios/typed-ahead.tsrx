import { state } from '@markless/core';
import { taglist } from '../../index.ts';

// A person typing faster than the field's handler: the next keys are already in
// the field by the time the commit the first one raised reaches the consumer.
export default function TypedAhead() @{
	const own = state({ tags: ['one'] as readonly string[] });
	let held = state('one');

	<main>
		<taglist.root
			max={3}
			delimiter=";"
			data-testid="root"
			value={own.tags}
			onChange={(next: readonly string[]) => {
				own.tags = next;
				held = next.join('|');
				const field = document.querySelector<HTMLInputElement>('[data-testid="input"]');
				if (field && field.value === 'two;three;') field.value = 'two;three;four';
			}}
		>
			<taglist.label data-testid="label">Keywords</taglist.label>
			<div role="presentation" data-testid="row">
				@for (const tag of own.tags; key tag) {
					<taglist.item value={tag} data-testid={`item-${tag}`}>
						<taglist.itemlabel data-testid={`itemlabel-${tag}`} />
					</taglist.item>
				}
			</div>
			<taglist.input data-testid="input" />
		</taglist.root>
		<output data-testid="held">{held}</output>
	</main>
}
