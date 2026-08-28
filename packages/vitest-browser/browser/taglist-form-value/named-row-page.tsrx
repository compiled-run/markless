import { state } from '@markless/core';
import { BoxAdder, BoxNamedField, BoxSeededRoot } from './shared-grow-family.tsrx';

// The same shape as the seeded page, with taglist's real field row: the hidden
// input's `name` reads an instance cell rather than the repeated item.
export default function NamedRowPage() @{
	const own = state({ tags: ['alpha', 'beta'] as readonly string[] });

	<section data-page>
		<BoxSeededRoot value={own.tags} name="topics">
			<BoxNamedField />
			<BoxAdder />
		</BoxSeededRoot>
	</section>
}
