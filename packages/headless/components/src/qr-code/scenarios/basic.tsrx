import * as qrcode from '../index.ts';

// The starter a consumer copies: a code carrying a URL, named for what scanning
// it does rather than for the string it holds.
//
// The import is the family folder rather than the package barrel because this
// family is not wired into the barrel yet; every other scenario here does the
// same, and they all become `import { qrcode } from '../../index.ts'` the day
// the barrel carries it.
export default function Basic() @{
	<qrcode.root data-testid="root" value="https://markless.dev" aria-label="Scan to open the site">
		<qrcode.frame data-testid="frame">
			<qrcode.patternsvg data-testid="patternsvg" width="160" height="160">
				<qrcode.patternpath data-testid="patternpath" fill="currentColor" />
			</qrcode.patternsvg>
		</qrcode.frame>
	</qrcode.root>
}
