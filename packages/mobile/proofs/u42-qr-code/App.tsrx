import { state } from '@markless/core';
import { qrcode } from '@markless/ui';

export default function App() @{
	const pairing = state({ code: 'alpha' });
	<main>
		<h1>Pair a device</h1>
		<p>{`Showing ${pairing.code}`}</p>
		<qrcode.root value={`https://example.com/pair/${pairing.code}`} aria-label="Scan to pair">
			<qrcode.frame>
				<qrcode.patternsvg width="200" height="200">
					<qrcode.patternpath fill="currentColor" />
				</qrcode.patternsvg>
			</qrcode.frame>
		</qrcode.root>
		<button onClick={() => (pairing.code = pairing.code === 'alpha' ? 'bravo' : 'alpha')}>New code</button>
	</main>
}
