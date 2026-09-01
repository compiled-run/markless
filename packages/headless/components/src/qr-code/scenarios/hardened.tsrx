import { qrcode } from '../../index.ts';

// A code whose recovery level is raised after it is on the page: a ticket that has to
// survive being printed badly gets more redundancy without the string changing at all.
export default function Hardened() @{
	<qrcode.root
		data-testid="root"
		value="https://example.com/receipt/9f2c1a"
		aria-label="Scan to open the receipt"
	>
		<qrcode.frame data-testid="frame">
			<qrcode.patternsvg data-testid="patternsvg" width="160" height="160">
				<qrcode.patternpath data-testid="patternpath" fill="currentColor" />
			</qrcode.patternsvg>
		</qrcode.frame>
		<Harden />
	</qrcode.root>
}

// Inside the root: the widget scope hands a component under the root the same code.
function Harden() @{
	const qr = qrcode.state();

	<button
		type="button"
		data-testid="harden"
		onClick={() => {
			qr.recovery = 'high';
		}}
	>Harden</button>
}
