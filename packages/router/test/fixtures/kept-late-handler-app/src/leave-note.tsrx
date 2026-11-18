import { state } from '@markless/core';
import { Link, navigate } from '@markless/router';

export default function LeaveNote() @{
	const note = state({ left: 'none', presses: 0, heard: 0 });

	<aside class="leave-note" data-leave-note onNavleave={(event) => {
		note.left = event.detail;
		note.heard++;
	}}>
		<p class="leave-text">{'This part is the same on every page, so an in-place navigation keeps it with the state it holds.'}</p>
		<p class="leave-text">{'It remembers the page the reader left, which the page tells it as the click on a link starts the navigation.'}</p>
		<button type="button" data-note-press onClick={() => note.presses++}>{`presses ${note.presses}`}</button>
		<span data-left>{note.left}</span>
		<span data-heard>{`heard ${note.heard}`}</span>
		<button type="button" data-go onClick={() => navigate('/reference')}>{'Go to the reference page'}</button>
		<button type="button" data-shell-save onClick={async () => void (await fetch('/save', { method: 'POST', body: 'shell' }))}>{'Save from the shell'}</button>
		<nav class="leave-links" aria-label="Pages">
			<Link href="/guide" data-nav="guide">{'Guide'}</Link>
			<Link href="/reference" data-nav="reference">{'Reference'}</Link>
			<Link href="/changelog" data-nav="changelog">{'Changelog'}</Link>
		</nav>
	</aside>
}
