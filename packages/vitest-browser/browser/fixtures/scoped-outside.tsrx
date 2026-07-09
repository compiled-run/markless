import { state } from '@markless/core';

// Throws in template position, so the crash happens mid-render — the
// realistic broken-component shape (a TSRX body cannot throw before its
// template; the template node must exist).
function crashingLabel(): string {
	throw new Error('crashing badge render');
}

function CrashingBadge() @{
	<span data-crashing-badge>{crashingLabel()}</span>
}

function SafeSibling() @{
	let taps = state(0);
	<button type="button" data-safe-sibling onClick={() => taps++}>{taps}</button>
}

export function App() @{
	<main>
		<CrashingBadge />
		<SafeSibling />
	</main>
}
