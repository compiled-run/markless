import { WrappedNote, WrappedRoot } from '../wrapped.tsrx';

export default function WrappedPage() @{
	<main data-wrapped-page>
		<WrappedRoot>
			<WrappedNote />
		</WrappedRoot>
	</main>
}
