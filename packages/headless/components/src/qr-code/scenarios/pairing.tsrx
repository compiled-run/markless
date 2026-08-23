import { state } from '@markless/core';
import * as qrcode from '../index.ts';

// A pairing code that rotates. `value` is bound to page state, so pressing the
// button re-encodes the pattern; the QDS reference copies `value` into a signal
// once at mount and never follows the prop again, which leaves the displayed
// code silently stale.
export default function Pairing() @{
	const session = state({ token: 'alpha' });

	<section>
		<qrcode.root
			data-testid="root"
			value={`https://example.com/pair/${session.token}`}
			aria-label="Scan to pair this device"
		>
			<qrcode.frame data-testid="frame">
				<qrcode.patternsvg data-testid="patternsvg" width="160" height="160">
					<qrcode.patternpath data-testid="patternpath" fill="currentColor" />
				</qrcode.patternsvg>
			</qrcode.frame>
		</qrcode.root>
		<button
			type="button"
			data-testid="rotate"
			onClick={() => {
				session.token = 'bravo';
			}}
		>Rotate the code</button>
		<p data-testid="token">{session.token}</p>
	</section>
}
