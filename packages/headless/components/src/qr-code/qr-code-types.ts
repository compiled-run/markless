import type { PropsOf } from '@markless/core';
import type { QrRecovery } from './qr-encode.ts';

/**
 * The code itself; the frame, pattern and any overlay go inside it. It encodes
 * the value and renders `role="img"`, which makes everything inside it
 * presentational - give it your own `aria-label` saying what the code is for.
 */
export type QrCodeRootProps = PropsOf<'div'> & {
	/** The text the code carries - usually a URL. */
	readonly value: string;
	/**
	 * How much of the code can be damaged or covered and still be read:
	 * "low" 7%, "medium" 15%, "quartile" 25%, "high" 30%. Omit it for "medium".
	 * A logo sitting on top of the code needs "quartile" or "high".
	 */
	readonly recovery?: QrRecovery;
};

/**
 * The box around the code. Give it light-coloured padding of roughly four
 * modules: the encoded symbol carries no margin of its own, and readers need
 * that quiet zone to find the code.
 */
export type QrCodeFrameProps = PropsOf<'div'>;

/** The `<svg>` the pattern is drawn in. Its rendered size is CSS. */
export type QrCodePatternSvgProps = PropsOf<'svg'>;

/** One `<path>` covering every dark module. */
export type QrCodePatternPathProps = PropsOf<'path'>;

/**
 * A box centred on the code, for a logo. Anything in here is decorative:
 * the root is `role="img"`, which makes everything inside it presentational,
 * so put nothing a reader needs to hear in an overlay.
 */
export type QrCodeOverlayProps = PropsOf<'div'>;
