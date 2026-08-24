import { computed, shared, state } from '@markless/core';
import type {
	QrCodeFrameProps,
	QrCodeOverlayProps,
	QrCodePatternPathProps,
	QrCodePatternSvgProps,
	QrCodeRootProps,
} from './qr-code-types.ts';
import { qrPath, qrViewBox } from './qr-encode.ts';

export const qrCodeState = shared(
	() => {
		const qr = state({
			value: '',
			recovery: 'medium' as 'low' | 'medium' | 'quartile' | 'high',
		});

		return {
			...qr,
			// Encoding is a pure.
 function of the two props, so it is a derive rather
			// than a task over a copy: the server resolves it at render, and a later
			// write to `value` re-derives it.
			viewBox: computed(() => qrViewBox(qr.value, qr.recovery)),
			path: computed(() => qrPath(qr.value, qr.recovery)),
		};
	},
	{ scope: 'widget' },
);

export function QrCodeRoot({ value, recovery = 'medium', children, ...rest }: QrCodeRootProps) @{
	const qr = qrCodeState();
	qr.value = value;
	qr.recovery = recovery;

	// No default accessible name. Naming the code after the string it carries would
	// read a pairing token or a TOTP secret aloud, and only the consumer knows what
	// the code is FOR, so only the consumer can name it.
	<div {...rest} role="img">{children}</div>
}

export function QrCodeFrame({ children, ...rest }: QrCodeFrameProps) @{
	<div {...rest}>{children}</div>
}

export function QrCodePatternSvg({ children, ...rest }: QrCodePatternSvgProps) @{
	const qr = qrCodeState();

	// One unit is one module, so the whole pattern is integer coordinates and
	// scaling is the consumer's width and height. Hidden from readers: the root
	// above is the one image, and the geometry inside it says nothing.
	<svg {...rest} viewBox={qr.viewBox} aria-hidden="true">{children}</svg>
}

export function QrCodePatternPath({ ...rest }: QrCodePatternPathProps) @{
	const qr = qrCodeState();

	<path {...rest} d={qr.path} />
}

export function QrCodeOverlay({ children, ...rest }: QrCodeOverlayProps) @{
	<div {...rest}>{children}</div>
}
