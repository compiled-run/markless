import { NoWriterAdder, NoWriterField, NoWriterRoot } from './no-writer-family.tsrx';

// Nothing outside the instance holds the collection: the page hands no prop in
// and keeps no cell of its own.
export default function NoWriterPage() @{
	<section data-page>
		<NoWriterRoot>
			<NoWriterField />
			<NoWriterAdder />
		</NoWriterRoot>
	</section>
}
