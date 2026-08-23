import * as qrcode from '../index.ts';

// Two codes carrying different strings on one page. Each is its own widget
// instance, so each renders its own pattern; a shared instance would show one
// code twice.
export default function TwoCodes() @{
	<section>
		<qrcode.root
			data-testid="first-root"
			value="https://example.com/table/12"
			aria-label="Scan to order at table 12"
		>
			<qrcode.frame data-testid="first-frame">
				<qrcode.patternsvg data-testid="first-patternsvg" width="120" height="120">
					<qrcode.patternpath data-testid="first-patternpath" fill="currentColor" />
				</qrcode.patternsvg>
			</qrcode.frame>
		</qrcode.root>
		<qrcode.root
			data-testid="second-root"
			value="https://example.com/table/13"
			aria-label="Scan to order at table 13"
		>
			<qrcode.frame data-testid="second-frame">
				<qrcode.patternsvg data-testid="second-patternsvg" width="120" height="120">
					<qrcode.patternpath data-testid="second-patternpath" fill="currentColor" />
				</qrcode.patternsvg>
			</qrcode.frame>
		</qrcode.root>
	</section>
}
