import { render, renderSSR } from '@markless/vitest-browser';
import { page } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import { encodeQrModules, modulesToPath, qrPath, qrViewBox, toUtf8Bytes } from './qr-encode.ts';
import Basic from './scenarios/basic.tsrx';
import Pairing from './scenarios/pairing.tsrx';
import RecoveryLevels from './scenarios/recovery-levels.tsrx';
import SpreadFirst from './scenarios/spread-first.tsrx';
import TwoCodes from './scenarios/two-codes.tsrx';
import TwoFactorSetup from './scenarios/two-factor-setup.tsrx';
import Unnamed from './scenarios/unnamed.tsrx';

const Root = page.getByTestId('root');
const Frame = page.getByTestId('frame');
const PatternSvg = page.getByTestId('patternsvg');
const PatternPath = page.getByTestId('patternpath');
const Overlay = page.getByTestId('overlay');
const ManualSecret = page.getByTestId('manual-secret');
const Rotate = page.getByTestId('rotate');
// The two codes on one page.
const FirstRoot = page.getByTestId('first-root');
const FirstPatternPath = page.getByTestId('first-patternpath');
const FirstPatternSvg = page.getByTestId('first-patternsvg');
const SecondRoot = page.getByTestId('second-root');
const SecondPatternPath = page.getByTestId('second-patternpath');
// The same string at two recovery levels.
const PlainPatternPath = page.getByTestId('plain-patternpath');
const PlainPatternSvg = page.getByTestId('plain-patternsvg');
const RuggedPatternPath = page.getByTestId('rugged-patternpath');
const RuggedPatternSvg = page.getByTestId('rugged-patternsvg');

const BASIC_VALUE = 'https://markless.dev';
const TOTP_VALUE = 'otpauth://totp/Acme:me@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Acme';
const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
const PAIR_ALPHA = 'https://example.com/pair/alpha';
const PAIR_BRAVO = 'https://example.com/pair/bravo';

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot be
// passed by reference or hidden in a helper: each test branches on the mode instead.
const MODES = ['CSR', 'SSR'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

function sideOf(value: string, recovery: 'low' | 'medium' | 'quartile' | 'high') {
	return encodeQrModules(value, recovery).length;
}

// --- the pure functions ---------------------------------------------------
//
// The encoder is the one piece of this family that is not markup, and it is a
// pure function, so it is asserted directly rather than through the DOM.

test('the encoded symbol is a standard size and an odd number of modules across', () => {
	const side = sideOf(BASIC_VALUE, 'medium');
	expect(side % 4).toBe(1); // every version is 4v + 17
	expect(side % 2).toBe(1);
	expect(side).toBeGreaterThanOrEqual(21);
	expect(side).toBeLessThanOrEqual(177);
});

test('the same string encodes to a byte-identical path every time', () => {
	// Determinism is what makes it safe for the server and the browser to render
	// the same pattern without comparing notes.
	expect(qrPath(TOTP_VALUE, 'quartile')).toBe(qrPath(TOTP_VALUE, 'quartile'));
	expect(qrViewBox(TOTP_VALUE, 'quartile')).toBe(qrViewBox(TOTP_VALUE, 'quartile'));
});

test('one dark module at the origin is one square in the path', () => {
	expect(modulesToPath([[true, false], [false, false]])).toBe('M 0 0 h 1 v 1 h -1 z ');
});

test('a matrix with nothing dark is an empty path, not an absent one', () => {
	expect(modulesToPath([[false, false], [false, false]])).toBe('');
});

test('more recovery gives a different pattern and never a smaller symbol', () => {
	const gentle = sideOf(BASIC_VALUE, 'low');
	const rugged = sideOf(BASIC_VALUE, 'high');
	expect(rugged).toBeGreaterThanOrEqual(gentle);
	expect(qrPath(BASIC_VALUE, 'high')).not.toBe(qrPath(BASIC_VALUE, 'low'));
});

test('non-ASCII text encodes as UTF-8 bytes', () => {
	expect(toUtf8Bytes('a')).toEqual([0x61]);
	expect(toUtf8Bytes('é')).toEqual([0xc3, 0xa9]);
	expect(toUtf8Bytes('✓')).toEqual([0xe2, 0x9c, 0x93]);
	expect(toUtf8Bytes('🎉')).toEqual([0xf0, 0x9f, 0x8e, 0x89]);
	expect(qrPath('héllo wörld ✓', 'medium').length).toBeGreaterThan(0);
});

test('text too long for the largest symbol is refused rather than truncated', () => {
	expect(() => qrPath('x'.repeat(1400), 'high')).toThrow(/more room/);
});

// --- the rendered anatomy -------------------------------------------------

function expectBasicRendered() {
	const modules = encodeQrModules(BASIC_VALUE, 'medium');

	// The family's one ARIA fact: the whole thing is a single image.
	expect(el(Root).getAttribute('role')).toBe('img');
	expect(el(Root).getAttribute('aria-label')).toBe('Scan to open the site');

	// The graphic inside says nothing a reader should walk into.
	expect(el(PatternSvg).getAttribute('aria-hidden')).toBe('true');
	expect(el(PatternSvg).getAttribute('viewBox')).toBe(`0 0 ${modules.length} ${modules.length}`);
	// The svg really is an SVG element, not an HTML element that spells the name.
	expect(el(PatternSvg).namespaceURI).toBe('http://www.w3.org/2000/svg');
	expect(el(PatternPath).namespaceURI).toBe('http://www.w3.org/2000/svg');

	// One path, holding the finished geometry.
	const drawn = el(PatternPath).getAttribute('d') ?? '';
	expect(drawn).toBe(modulesToPath(modules));
	expect(drawn.length).toBeGreaterThan(0);

	// The parts nest the way the anatomy says they do.
	expect(el(Root).contains(el(Frame))).toBe(true);
	expect(el(Frame).contains(el(PatternSvg))).toBe(true);
	expect(el(PatternSvg).contains(el(PatternPath))).toBe(true);

	// There is no state in this family, so no part reflects any.
	for (const part of [el(Root), el(Frame), el(PatternSvg), el(PatternPath)])
		expect([...part.attributes].some((attribute) => attribute.name.startsWith('ui-'))).toBe(false);
}

function expectNoNameIsInvented() {
	// A consumer who wrote no name gets no name, rather than one built from the value.
	expect(el(Root).getAttribute('role')).toBe('img');
	expect(el(Root).hasAttribute('aria-label')).toBe(false);
	expect(el(Root).hasAttribute('aria-labelledby')).toBe(false);
	expect(el(Root).hasAttribute('title')).toBe(false);
	// Nothing announces the value as text either.
	expect(el(Root).textContent ?? '').toBe('');
}

function expectTheNameIsThePurposeNotTheValue() {
	expect(el(Root).getAttribute('aria-label')).toBe(
		'Scan to add this account to your authenticator app',
	);
	// The consumer's own manual-entry affordance is untouched, and is the place
	// the secret is meant to appear: a person reading this screen on their phone
	// cannot point that phone's camera at itself.
	expect(el(ManualSecret).textContent).toBe(TOTP_SECRET);
}

function expectOverlayRenders() {
	const modules = encodeQrModules(TOTP_VALUE, 'quartile');
	expect(el(PatternPath).getAttribute('d')).toBe(modulesToPath(modules));
	expect(el(PatternSvg).getAttribute('viewBox')).toBe(`0 0 ${modules.length} ${modules.length}`);

	// The overlay is a plain box with the consumer's content in it, sitting
	// inside the frame beside the pattern rather than inside the svg.
	expect(el(Overlay).textContent).toBe('Acme');
	expect(el(Frame).contains(el(Overlay))).toBe(true);
	expect(el(PatternSvg).contains(el(Overlay))).toBe(false);
	// It carries nothing of its own: an overlay under `role="img"` is
	// presentational, so an ARIA attribute here would be a false promise.
	expect(el(Overlay).hasAttribute('role')).toBe(false);
	expect(el(Overlay).hasAttribute('aria-hidden')).toBe(false);
	// A logo covers modules, so this scenario asks for a code that survives it.
	expect(modules.length).toBe(sideOf(TOTP_VALUE, 'quartile'));
}

function expectSpreadCannotDisplaceThePart() {
	const modules = encodeQrModules('https://example.com/spread', 'medium');
	// Each part spreads `{...rest}` first, so its own attribute lands last.
	expect(el(Root).getAttribute('role')).toBe('img');
	expect(el(PatternSvg).getAttribute('viewBox')).toBe(`0 0 ${modules.length} ${modules.length}`);
	expect(el(PatternPath).getAttribute('d')).toBe(modulesToPath(modules));
	// A consumer attribute that collides with nothing still arrives.
	expect(el(Frame).getAttribute('data-owner')).toBe('consumer');
	expect(el(PatternPath).getAttribute('fill')).toBe('currentColor');
}

function expectEachCodeRendersItsOwnPattern() {
	const first = modulesToPath(encodeQrModules('https://example.com/table/12', 'medium'));
	const second = modulesToPath(encodeQrModules('https://example.com/table/13', 'medium'));
	expect(first).not.toBe(second);
	expect(el(FirstPatternPath).getAttribute('d')).toBe(first);
	expect(el(SecondPatternPath).getAttribute('d')).toBe(second);
	// Two widget instances, not one shared one.
	expect(el(FirstRoot).contains(el(SecondRoot))).toBe(false);
	expect(el(FirstPatternSvg).getAttribute('viewBox')).toBe(
		qrViewBox('https://example.com/table/12', 'medium'),
	);
}

function expectRecoveryChangesThePattern() {
	const value = 'https://example.com/receipt/9f2c1a';
	expect(el(PlainPatternPath).getAttribute('d')).toBe(qrPath(value, 'medium'));
	expect(el(RuggedPatternPath).getAttribute('d')).toBe(qrPath(value, 'high'));
	expect(el(PlainPatternPath).getAttribute('d')).not.toBe(el(RuggedPatternPath).getAttribute('d'));
	// More recovery never shrinks the symbol.
	expect(sideOf(value, 'high')).toBeGreaterThanOrEqual(sideOf(value, 'medium'));
	expect(el(PlainPatternSvg).getAttribute('viewBox')).toBe(qrViewBox(value, 'medium'));
	expect(el(RuggedPatternSvg).getAttribute('viewBox')).toBe(qrViewBox(value, 'high'));
}

function expectPairingStartsAtAlpha() {
	expect(el(PatternPath).getAttribute('d')).toBe(qrPath(PAIR_ALPHA, 'medium'));
	expect(el(PatternSvg).getAttribute('viewBox')).toBe(qrViewBox(PAIR_ALPHA, 'medium'));
}

async function expectRotatingTheValueReDerivesThePattern() {
	expectPairingStartsAtAlpha();

	el(Rotate).click();
	// The pattern is a derive over the seeded prop rather than a copy taken at mount,
	// so a rotated code shows the new value instead of the first one.
	await expect.poll(() => el(PatternPath).getAttribute('d')).toBe(qrPath(PAIR_BRAVO, 'medium'));
	await expect
		.poll(() => el(PatternSvg).getAttribute('viewBox'))
		.toBe(qrViewBox(PAIR_BRAVO, 'medium'));
	expect(qrPath(PAIR_BRAVO, 'medium')).not.toBe(qrPath(PAIR_ALPHA, 'medium'));
}

for (const mode of MODES) {
	test(`${mode}: the starter renders one image holding one finished path`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	test(`${mode}: a code the consumer did not name gets no invented name`, async () => {
		if (mode === 'CSR') await render(Unnamed);
		else await renderSSR(Unnamed);
		expectNoNameIsInvented();
	});

	test(`${mode}: the accessible name says what scanning does, not what it carries`, async () => {
		if (mode === 'CSR') await render(TwoFactorSetup);
		else await renderSSR(TwoFactorSetup);
		expectTheNameIsThePurposeNotTheValue();
	});

	test(`${mode}: an overlay renders beside the pattern, inside the image`, async () => {
		if (mode === 'CSR') await render(TwoFactorSetup);
		else await renderSSR(TwoFactorSetup);
		expectOverlayRenders();
	});

	test(`${mode}: a consumer prop cannot displace role, viewBox or d`, async () => {
		if (mode === 'CSR') await render(SpreadFirst);
		else await renderSSR(SpreadFirst);
		expectSpreadCannotDisplaceThePart();
	});

	test(`${mode}: two codes on one page render their own patterns`, async () => {
		if (mode === 'CSR') await render(TwoCodes);
		else await renderSSR(TwoCodes);
		expectEachCodeRendersItsOwnPattern();
	});

	test(`${mode}: recovery changes the pattern the same string produces`, async () => {
		if (mode === 'CSR') await render(RecoveryLevels);
		else await renderSSR(RecoveryLevels);
		expectRecoveryChangesThePattern();
	});

	test(`${mode}: a bound value renders the pattern for the value it holds`, async () => {
		if (mode === 'CSR') await render(Pairing);
		else await renderSSR(Pairing);
		expectPairingStartsAtAlpha();
	});

	test(`${mode}: rotating the value re-derives the pattern`, async () => {
		if (mode === 'CSR') await render(Pairing);
		else await renderSSR(Pairing);
		await expectRotatingTheValueReDerivesThePattern();
	});
}

// --- SSR ------------------------------------------------------------------
//
// This is the family's whole pitch, so it is asserted rather than claimed: the
// pattern is finished markup on arrival, and for a static value nothing on the
// client has to run at all.

test('SSR: the served markup already carries the finished path', async () => {
	await renderSSR(Basic);
	// Read before anything else touches the page.
	const served = el(PatternPath).getAttribute('d');
	const modules = encodeQrModules(BASIC_VALUE, 'medium');
	expect(served).toBe(modulesToPath(modules));
	expect(el(PatternSvg).getAttribute('viewBox')).toBe(`0 0 ${modules.length} ${modules.length}`);
	expect(el(Root).getAttribute('role')).toBe('img');
	expect(el(Root).getAttribute('aria-label')).toBe('Scan to open the site');
});

// The byte-identical claim between the two modes is carried by the per-mode
// rows above rather than by one row rendering twice: both branches assert the
// pattern against the same pure `modulesToPath(encodeQrModules(...))` string, so
// agreeing with it is agreeing with each other. A single test that mounted both
// would leave two trees on the page and every part locator would resolve twice.

test('SSR: a static code does not move after resume', async () => {
	await renderSSR(Basic);
	const served = el(PatternPath).getAttribute('d');

	// There is no gesture in this family, so resume has nothing to restore.
	// Give the page a turn anyway and assert the pattern did not move.
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(el(PatternPath).getAttribute('d')).toBe(served);
	expect(el(PatternPath).getAttribute('d')).toBe(qrPath(BASIC_VALUE, 'medium'));
});

test('SSR: the first write after resume re-derives a bound pattern', async () => {
	await renderSSR(Pairing);
	expect(el(PatternPath).getAttribute('d')).toBe(qrPath(PAIR_ALPHA, 'medium'));

	el(Rotate).click();
	await expect.poll(() => el(PatternPath).getAttribute('d')).toBe(qrPath(PAIR_BRAVO, 'medium'));
	await expect.poll(() => page.getByTestId('token').element()?.textContent).toBe('bravo');
});

// --- the secret stays off the widget --------------------------------------
//
// `QrCodeRoot` destructures `value` and `recovery`, so neither is left in `{...rest}`
// and neither may reach the element as a raw attribute. This is the one family where
// the leaked prop would be the secret itself: a TOTP secret must not be readable off
// the widget, and an attribute carrying it is exactly as readable as a name would be.

for (const mode of MODES) {
	test(`${mode}: the encoded value does not reach the root element as an attribute`, async () => {
		if (mode === 'CSR') await render(Unnamed);
		else await renderSSR(Unnamed);
		expect(el(Root).outerHTML).not.toContain('8f3a');
		expect(el(Root).hasAttribute('value')).toBe(false);
	});

	test(`${mode}: a TOTP secret never appears anywhere in the code's own markup`, async () => {
		if (mode === 'CSR') await render(TwoFactorSetup);
		else await renderSSR(TwoFactorSetup);
		const markup = el(Root).outerHTML;
		expect(markup).not.toContain(TOTP_SECRET);
		expect(markup).not.toContain('otpauth');
		expect(markup).not.toContain('me@example.com');
		expect(el(Root).hasAttribute('recovery')).toBe(false);
	});
}
