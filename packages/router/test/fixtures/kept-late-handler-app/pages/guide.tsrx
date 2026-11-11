import LeaveNote from '../src/leave-note.tsrx';
import LeaveStore from '../src/leave-store.tsrx';
import SaveShelf from '../src/save-shelf.tsrx';

export default function Page() @{
	<>
		<LeaveNote />
		<main data-main="guide">
			<h1 data-title>{'Guide page'}</h1>
			<p>{'The guide page has its own content, which a navigation replaces.'}</p>
			<SaveShelf />
		</main>
		<LeaveStore />
	</>
}
