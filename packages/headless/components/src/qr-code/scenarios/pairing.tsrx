import { state } from '@markless/core';
import { qrcode } from '../../index.ts';

// A pairing code that rotates. `value` is bound to page state, so pressing the button
// re-encodes the pattern rather than leaving a stale code on screen.
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
