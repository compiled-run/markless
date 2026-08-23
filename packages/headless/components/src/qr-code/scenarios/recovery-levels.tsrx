import * as qrcode from '../index.ts';

// The same string at two recovery levels. More recovery means more error
// correction codewords, so the symbol is the same size or larger and the
// pattern is a different one - which is what makes `recovery` a real prop
// rather than a hint.
export default function RecoveryLevels() @{
	<section>
		<qrcode.root
			data-testid="plain-root"
			value="https://example.com/receipt/9f2c1a"
			aria-label="Scan to open the receipt"
		>
			<qrcode.frame data-testid="plain-frame">
				<qrcode.patternsvg data-testid="plain-patternsvg" width="160" height="160">
					<qrcode.patternpath data-testid="plain-patternpath" fill="currentColor" />
				</qrcode.patternsvg>
			</qrcode.frame>
		</qrcode.root>
		<qrcode.root
			data-testid="rugged-root"
			value="https://example.com/receipt/9f2c1a"
			recovery="high"
			aria-label="Scan to open the receipt"
		>
			<qrcode.frame data-testid="rugged-frame">
				<qrcode.patternsvg data-testid="rugged-patternsvg" width="160" height="160">
					<qrcode.patternpath data-testid="rugged-patternpath" fill="currentColor" />
				</qrcode.patternsvg>
			</qrcode.frame>
		</qrcode.root>
	</section>
}
