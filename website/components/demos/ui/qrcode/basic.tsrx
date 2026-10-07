import { lucide, qrcode } from '@markless/ui';

export default function QrcodeBasic() @{
	const logo = false;

	<qrcode.root class="qr" value="https://markless.dev" aria-label="Scan to open markless.dev">
		<qrcode.frame class="qr-frame">
			<qrcode.patternsvg class="qr-pattern">
				<qrcode.patternpath fill="currentColor" />
			</qrcode.patternsvg>
		</qrcode.frame>
		<qrcode.overlay class="qr-logo" hidden={!logo}>
			<lucide.coffee aria-hidden="true" />
		</qrcode.overlay>

		<style>
			.qr {
				position: relative;
				width: min(12rem, 100%);
			}

			.qr-frame {
				padding: 1rem;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
			}

			.qr-pattern {
				display: block;
				width: 100%;
				height: auto;
				aspect-ratio: 1;
				shape-rendering: crispEdges;
			}

			.qr-logo {
				position: absolute;
				inset: 50% auto auto 50%;
				display: grid;
				place-items: center;
				width: 2.6rem;
				height: 2.6rem;
				translate: -50% -50%;
				border: 1px solid var(--ink);
				border-radius: 999px;
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
				color: var(--ink);
			}

			.qr-logo[hidden] {
				display: none;
			}

			.qr-logo svg {
				width: 1.3rem;
				height: 1.3rem;
			}
		</style>
	</qrcode.root>;
}
