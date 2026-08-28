import { base } from '../../index.ts';

// The part takes a closed prop list rather than spreading the rest onto its
// element, so the test ids sit on wrappers rather than on the separators.
export default function Separators() @{
	<div data-testid="separator-parts">
		<p>Above</p>
		<span data-testid="rule"><base.separator /></span>
		<p>Below</p>
		<span data-testid="column-rule"><base.separator orientation="vertical" /></span>
		<p>Beside</p>
		<span data-testid="paint"><base.separator decorative /></span>
	</div>
}
