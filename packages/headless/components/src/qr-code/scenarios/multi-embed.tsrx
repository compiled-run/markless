import { qrcode } from '../../index.ts';

// One embed's worth of page, mounted twice as two islands. Both carry the SAME
// string on purpose: two codes that already differ would look isolated whatever the
// payload did, so the embeds start identical and only one of them is rotated.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<qrcode.root
			data-testid="root"
			value="https://example.com/pair/12"
			aria-label="Scan to pair this device"
		>
			<qrcode.frame data-testid="code-frame">
				<qrcode.patternsvg data-testid="patternsvg" width="120" height="120">
					<qrcode.patternpath data-testid="patternpath" fill="currentColor" />
				</qrcode.patternsvg>
			</qrcode.frame>
			<Rotate />
		</qrcode.root>
	</section>
}

// Inside the root, where the widget scope is meant to hand it this code rather than
// a new one — a prop cannot do that job, because the root seeds its cell from
// `value` once and a later prop change never reaches it.
function Rotate() @{
	const qr = qrcode.state();

	<div data-testid="carried" ui-value={qr.value}>
		<button
			type="button"
			data-testid="rotate"
			onClick={() => {
				qr.value = 'https://example.com/pair/rotated';
			}}
		>Rotate</button>
	</div>
}
