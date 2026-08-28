import { state } from '@markless/core';
import { BoxAdder, BoxField, BoxSeededRoot } from './shared-grow-family.tsrx';

// The taglist shape: the collection lives on the page's own state object and the
// root writes it onto the instance from its prop on every render.
export default function SeededPage() @{
	const own = state({ tags: ['alpha', 'beta'] as readonly string[] });

	<section data-page>
		<BoxSeededRoot value={own.tags}>
			<BoxField />
			<BoxAdder />
		</BoxSeededRoot>
	</section>
}
