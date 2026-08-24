import { qrcode } from '../../index.ts';

// Every part spreads the consumer's props FIRST, so the family's own attributes
// land last and win. This scenario writes the three a consumer could plausibly
// pass by accident - a `role` on the root, a `viewBox` on the pattern svg, a `d`
// on the path - and the suite asserts none of them displaced the real one.
export default function SpreadFirst() @{
	<qrcode.root
		data-testid="root"
		value="https://example.com/spread"
		aria-label="Scan to open the page"
		role="button"
	>
		<qrcode.frame data-testid="frame" data-owner="consumer">
			<qrcode.patternsvg data-testid="patternsvg" viewBox="0 0 1 1" width="160" height="160">
				<qrcode.patternpath data-testid="patternpath" d="M 0 0" fill="currentColor" />
			</qrcode.patternsvg>
		</qrcode.frame>
	</qrcode.root>
}
