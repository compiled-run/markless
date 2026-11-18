import { sel } from '../fixtures/sel.tsrx';

export function Label() @{
	<b data-label>widget</b>
}

export function RemoteContent() @{
	const s = sel();

	<span data-remote-content>{s.open}</span>
}
