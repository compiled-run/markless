import { SeededAdder, SeededField } from './seeded-family.tsrx';

// A part, and no root or carrier of its family anywhere on the page: nothing
// here holds the family's cells, so the part's handler read reaches no instance.
export default function RootlessPage() @{
	<section data-page>
		<SeededField />
		<SeededAdder />
	</section>
}
