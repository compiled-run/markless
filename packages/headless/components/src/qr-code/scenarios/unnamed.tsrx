import * as qrcode from '../index.ts';

// The only scenario here deliberately missing an `aria-label`, so the suite can
// assert what the family does NOT do: invent a name. A name built from the value
// would read this pairing token aloud, and a TOTP secret on a two-factor screen.
//
// A real screen must name its code. This one is a probe, not a pattern to copy.
export default function Unnamed() @{
	<qrcode.root data-testid="root" value="https://example.com/pair/8f3a">
		<qrcode.frame data-testid="frame">
			<qrcode.patternsvg data-testid="patternsvg" width="160" height="160">
				<qrcode.patternpath data-testid="patternpath" fill="currentColor" />
			</qrcode.patternsvg>
		</qrcode.frame>
	</qrcode.root>
}
