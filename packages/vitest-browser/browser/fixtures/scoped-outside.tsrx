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

// The surviving interactivity is PAGE-level on purpose: composed-child
// event wiring has its own known gap (map 9j) and must not confound the
// containment contract under test here.
export function App() @{
	let taps = state(0);
	<main>
		<CrashingBadge />
		<button type="button" data-safe-sibling onClick={() => taps++}>{taps}</button>
	</main>
}
