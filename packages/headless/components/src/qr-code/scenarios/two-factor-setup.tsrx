import * as qrcode from '../index.ts';

// The realistic screen, and the one that teaches. Three things here are not
// decoration:
//
// - the accessible name says what scanning the code DOES. It must never be the
//   value, which here is an `otpauth://` URI carrying a TOTP secret: a name
//   built from the value reads that secret aloud.
// - `recovery="quartile"` because a logo sits on top of the code. A logo over
//   the default "medium" code, and certainly over a "low" one, stops it
//   scanning.
// - the secret is also printed as selectable text. A person reading this screen
//   on their phone cannot point that phone's camera at itself, so a QR-only
//   screen is unusable for them.
export default function TwoFactorSetup() @{
	<section>
		<qrcode.root
			data-testid="root"
			value="otpauth://totp/Acme:me@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Acme"
			recovery="quartile"
			aria-label="Scan to add this account to your authenticator app"
		>
			<qrcode.frame data-testid="frame">
				<qrcode.patternsvg data-testid="patternsvg" width="200" height="200">
					<qrcode.patternpath data-testid="patternpath" fill="currentColor" />
				</qrcode.patternsvg>
				<qrcode.overlay data-testid="overlay">Acme</qrcode.overlay>
			</qrcode.frame>
		</qrcode.root>
		<p>Cannot scan it? Enter this code by hand:</p>
		<code data-testid="manual-secret">JBSWY3DPEHPK3PXP</code>
	</section>
}
