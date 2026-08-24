import { state } from '@markless/core';

// Defect 97 in the browser. `Box` puts a button AFTER `{children}`, so the
// projected `<p>` sits BETWEEN the child's own two elements. A document walk
// reaches main(0) div(1) p(2) button(3). The server used to emit the child's
// tokens whole and append the projection's, so the served table said button(2)
// and p(3) — resume then wired the click and the text update onto the `<p>`,
// and the button did nothing.
export default function Page() @{
	<main>
		<Box><p data-projected="">projected</p></Box>
	</main>
}

export function Box({ children }) @{
	let taps = state(0);

	<div data-box="">{children}<button data-after="" onClick={() => taps++}>{taps}</button></div>
}
