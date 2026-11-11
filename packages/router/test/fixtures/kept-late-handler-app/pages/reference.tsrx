import LeaveNote from '../src/leave-note.tsrx';
import LeaveStore from '../src/leave-store.tsrx';

export default function Page() @{
	<>
		<LeaveNote />
		<main data-main="reference">
			<h1 data-title>{'Reference page'}</h1>
			<p>{'The reference page has its own content, which a navigation replaces.'}</p>
		</main>
		<LeaveStore />
	</>
}
