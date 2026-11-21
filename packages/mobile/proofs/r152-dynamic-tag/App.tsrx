import { state } from '@markless/core';

function Note({
	asChild,
	label,
	children,
	...rest
}: {
	asChild?: boolean;
	label: string;
	children?: unknown;
	[name: string]: unknown;
}) @{
	let taps = state(0);
	const tag = asChild === true ? 'div' : 'p';
	<>
		<{tag} {...rest} onClick={() => (taps = taps + 1)}>{children}</{tag}>
		<p>
			{label} taps: {taps}
		</p>
	</>
}

export default function App() @{
	<main>
		<h1>Notes</h1>
		<Note label="First" data-note="first">Tap the first note</Note>
		<Note label="Second" asChild={true}>Tap the second note</Note>
	</main>
}
