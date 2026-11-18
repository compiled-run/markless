import LeaveNote from '../src/leave-note.tsrx';
import LeaveStore from '../src/leave-store.tsrx';

export default function Page() @{
	<>
		<LeaveNote />
		<main data-main="changelog">
			<h1 data-title>{'Changelog page'}</h1>
			<p>{'The changelog page has its own content, which a navigation replaces.'}</p>
		</main>
		<LeaveStore />
	</>
}
