import * as qrcode from '../index.ts';

// Deliberately missing an `aria-label`, and it is the only scenario here that
// is. It exists so the suite can assert what the family does NOT do: invent a
// name. The QDS reference defaults to `QR code for ${value}`, which for this
// value reads a pairing token aloud and for a two-factor code reads the TOTP
// secret aloud.
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
