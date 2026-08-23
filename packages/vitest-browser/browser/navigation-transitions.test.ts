import { afterEach, expect, test } from 'vitest';
import { dispatchRouteUpdate, startRouteUpdateRenderer } from '@markless/core/router';
import { render } from '@markless/web/render';
import AlphaPage from './fixtures/nav-page-alpha.tsrx?markless-route';
import BetaPage from './fixtures/nav-page-beta.tsrx?markless-route';
import SlowPage from './fixtures/nav-page-slow.tsrx?markless-route';
import { armNavSettleGate } from './fixtures/nav-settle-gate.ts';

// T110 / spec D8 navigation transitions: a client route swap holds the
// outgoing page LIVE AND INTERACTIVE while the destination renders and its
// boundary runners settle. Fast destinations commit in ONE swap with no
// @pending frame; slow destinations show honest pending UI only after the
// navigation deadline, and once shown it stays the minimum duration.
//
// INTEGRATION-ONLY (T116 gate 1): these fixtures prove the D8 machine is
// wired to real route swaps in a real browser — real render, real
// MutationObserver truth, real interactivity. All timing SEMANTICS
// (settle-vs-deadline-vs-min-duration orderings, exact boundaries, abort/
// supersede) are property-tested under a fake clock in
// packages/router/test/navigation-hold.test.ts and
// packages/web/test/settle-tracker-timing.test.ts. No assertion here may
// depend on real-wait durations; only on ORDERINGS and DOM-state existence.
//
// That discipline also governs the PREMISES, not just the assertions. The
// fast destination settles through a test-opened gate (fixtures/
// nav-settle-gate.ts) rather than its own wall-clock timer, because "settles
// inside the 250ms deadline" must be true by construction: a nominal 80ms
// timer is not 80ms on a contended machine, and a destination that genuinely
// misses the deadline is REQUIRED to show its @pending arm, so a wall-clock
// premise turns correct D8 behavior into a flaky failure of this invariant.
// The slow destination keeps its timer: overshooting a deadline is robust
// under load in a way that undershooting one is not.
//
// The route renderer targets document.body, so each test drives a dedicated
// iframe document and records every DOM state transition of its body with a
// MutationObserver (stricter than frame sampling: a state that never exists
// in the DOM can never be painted).

type BodySample = { readonly at: number; readonly html: string };

type Sampler = { readonly samples: BodySample[]; readonly stop: () => void };

const iframes: HTMLIFrameElement[] = [];

afterEach(() => {
	for (const iframe of iframes.splice(0)) iframe.remove();
});

function createRouteDocument(): Document {
	const iframe = document.createElement('iframe');
	iframe.style.width = '640px';
	iframe.style.height = '480px';
	document.body.appendChild(iframe);
	iframes.push(iframe);
	const routeDocument = iframe.contentDocument;
	if (!routeDocument) throw new Error('Expected the iframe to expose a document.');
	startRouteUpdateRenderer(routeDocument);
	return routeDocument;
}

function sampleBody(routeDocument: Document): Sampler {
	const samples: BodySample[] = [];
	const record = () =>
		samples.push({ at: performance.now(), html: routeDocument.body.innerHTML });
	const observer = new MutationObserver(record);
	observer.observe(routeDocument.body, {
		attributes: true,
		characterData: true,
		childList: true,
		subtree: true,
	});
	record();
	return {
		samples,
		stop() {
			observer.disconnect();
		},
	};
}

function navigateTo(routeDocument: Document, page: unknown, pathname: string): number {
	const at = performance.now();
	dispatchRouteUpdate(routeDocument, {
		page: { default: page },
		route: {
			file: `pages${pathname}.tsrx`,
			params: {},
			status: 200,
			url: `http://localhost${pathname}`,
		},
	});
	return at;
}

async function waitForBody(
	routeDocument: Document,
	predicate: (html: string) => boolean,
	timeoutMs: number,
	label: string,
): Promise<void> {
	const start = performance.now();
	while (performance.now() - start < timeoutMs) {
		if (predicate(routeDocument.body.innerHTML)) return;
		await new Promise((resolve) => setTimeout(resolve, 8));
	}
	throw new Error(`Timed out waiting for ${label}.`);
}

function firstSampleWith(samples: readonly BodySample[], marker: string): BodySample | undefined {
	return samples.find((sample) => sample.html.includes(marker));
}

// Observer-driven wait: resolves on the mutation that satisfies the predicate,
// so it costs only the time the runtime actually needs. waitForBody's 8ms poll
// would spend that much of the navigation deadline on polling granularity
// alone, which is exactly the wall-clock dependence this file must not have.
function whenBody(
	routeDocument: Document,
	predicate: (html: string) => boolean,
	label: string,
): Promise<void> {
	if (predicate(routeDocument.body.innerHTML)) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const finish = (fail?: Error) => {
			observer.disconnect();
			clearTimeout(timer);
			if (fail) reject(fail);
			else resolve();
		};
		const observer = new MutationObserver(() => {
			if (predicate(routeDocument.body.innerHTML)) finish();
		});
		observer.observe(routeDocument.body, {
			attributes: true,
			characterData: true,
			childList: true,
			subtree: true,
		});
		const timer = setTimeout(() => finish(new Error(`Timed out waiting for ${label}.`)), 5000);
	});
}

// One throwaway round trip to the destination and back, so the measured swap
// navigates to a page whose modules are already resident. Uses the same gate,
// so the warm-up cannot hang on a wall-clock read either.
async function warmDestination(routeDocument: Document): Promise<void> {
	const warmGate = armNavSettleGate();
	navigateTo(routeDocument, BetaPage, '/beta');
	await warmGate.reached;
	warmGate.open();
	await waitForBody(
		routeDocument,
		(html) => html.includes('data-nav-settled="beta"'),
		5000,
		'beta warm-up settle',
	);
	navigateTo(routeDocument, AlphaPage, '/alpha');
	await waitForBody(
		routeDocument,
		(html) => html.includes('data-nav-settled="alpha"') && !html.includes('data-nav-page="beta"'),
		5000,
		'alpha restore after warm-up',
	);
}

test('fast route swap: no pending frame, one swap, outgoing page stays interactive', async () => {
	const routeDocument = createRouteDocument();

	navigateTo(routeDocument, AlphaPage, '/alpha');
	await waitForBody(
		routeDocument,
		(html) => html.includes('data-nav-settled="alpha"'),
		3000,
		'alpha settle',
	);

	// Warm the destination before the swap under test. A destination's settle
	// is not just its own read: a COLD destination also has to pull its lazily
	// fetched symbol and runtime modules off the dev server, and that load —
	// not the page's read — is what actually spends the 250ms budget under
	// load. A swap toward an unloaded page is not the "fast swap" this test is
	// about, and D8 is right to show @pending for it. The measured navigation
	// below therefore starts from an already-resident destination.
	await warmDestination(routeDocument);

	const sampler = sampleBody(routeDocument);
	// The destination's read suspends on this gate instead of a wall-clock
	// timer, so "settles inside the navigation deadline" is true by
	// construction rather than by the machine keeping its timers punctual.
	const gate = armNavSettleGate();
	navigateTo(routeDocument, BetaPage, '/beta');

	// The outgoing page must still be live: click its counter DURING the hold.
	const tap = routeDocument.querySelector<HTMLButtonElement>('button[data-alpha-tap]');
	if (!tap) throw new Error('Expected the alpha tap button in the live DOM.');
	tap.click();

	// Premise pin: wait for the destination's read to actually suspend, so the
	// boundary really is pending and its @pending arm really was rendered and
	// could leak. Waiting on the gate itself (not a poll) costs no deadline
	// budget however long the destination's render takes; if the read never
	// suspends this test hangs to its timeout instead of passing vacuously.
	await gate.reached;

	// Still held, so the outgoing page must service the mid-transition click:
	// wait for its own counter update to reach the live DOM. Holding the gate
	// until then is what makes "the outgoing page stays interactive DURING the
	// transition" a real claim rather than a race the swap can win.
	await whenBody(routeDocument, (html) => html.includes('Taps 1'), 'the outgoing page tap');

	// At this instant the destination has rendered with a pending boundary, so
	// the hold is the only thing keeping its @pending arm out of view: the live
	// document must still be the whole outgoing page, carrying nothing of the
	// destination at all.
	const heldHtml = routeDocument.body.innerHTML;
	expect(heldHtml).toContain('data-nav-page="alpha"');
	expect(heldHtml).not.toContain('data-nav-page="beta"');
	expect(heldHtml).not.toContain('data-nav-pending');

	// Release it: the read resumes on a microtask, and microtasks always drain
	// before the next macrotask, so the destination settles inside the 250ms
	// deadline no matter how contended the machine is.
	gate.open();

	await waitForBody(
		routeDocument,
		(html) => html.includes('data-nav-settled="beta"'),
		3000,
		'beta settle',
	);
	sampler.stop();

	// D8: the destination's @pending arm never exists in the live document.
	for (const sample of sampler.samples) {
		expect(sample.html).not.toContain('data-nav-pending');
	}

	// One swap: every recorded state before the settled destination still shows
	// the full outgoing page (no blank frame, no intermediate skeleton).
	const settled = firstSampleWith(sampler.samples, 'data-nav-settled="beta"');
	if (!settled) throw new Error('Expected a settled beta sample.');
	for (const sample of sampler.samples) {
		if (sample.at < settled.at) expect(sample.html).toContain('data-nav-page="alpha"');
	}

	// The mid-transition click landed on the still-mounted outgoing page.
	const tapped = firstSampleWith(sampler.samples, 'Taps 1');
	if (!tapped) throw new Error('Expected the outgoing page to record the mid-transition tap.');
	expect(tapped.at).toBeLessThan(settled.at);
});

test('slow destination: pending appears only after the deadline and stays the minimum duration', async () => {
	const routeDocument = createRouteDocument();

	navigateTo(routeDocument, AlphaPage, '/alpha');
	await waitForBody(
		routeDocument,
		(html) => html.includes('data-nav-settled="alpha"'),
		3000,
		'alpha settle',
	);

	const sampler = sampleBody(routeDocument);
	navigateTo(routeDocument, SlowPage, '/slow');

	// Interactive well inside the deadline window.
	const tap = routeDocument.querySelector<HTMLButtonElement>('button[data-alpha-tap]');
	if (!tap) throw new Error('Expected the alpha tap button in the live DOM.');
	tap.click();

	await waitForBody(
		routeDocument,
		(html) => html.includes('data-nav-settled="slow"'),
		5000,
		'slow settle',
	);
	sampler.stop();

	const pending = firstSampleWith(sampler.samples, 'data-nav-pending="slow"');
	const settled = firstSampleWith(sampler.samples, 'data-nav-settled="slow"');
	if (!pending) throw new Error('Expected honest pending UI for the slow destination.');
	if (!settled) throw new Error('Expected the slow destination to settle.');

	// Ordering-only integration truth: pending UI appeared, then settled
	// content replaced it (exact deadline/min-duration durations are the fake
	// clock suites' responsibility, never real-wait assertions here).
	expect(settled.at).toBeGreaterThan(pending.at);

	// Outgoing page stayed whole and interactive until the pending swap.
	const tapped = firstSampleWith(sampler.samples, 'Taps 1');
	if (!tapped) throw new Error('Expected the outgoing page to record the mid-transition tap.');
	expect(tapped.at).toBeLessThan(pending.at);
	for (const sample of sampler.samples) {
		if (sample.at < pending.at) expect(sample.html).toContain('data-nav-page="alpha"');
	}
});

// Compiled pages are element/component-rooted (fragment-rooted pages emit no
// renderCsr today), so the holder path is proven at the render() level: a
// fragment-rooted output under a hold mounts ONCE inside a layout-transparent
// holder that stays the container root.
test('held fragment output mounts once through a layout-transparent holder', async () => {
	const host = document.createElement('div');
	document.body.appendChild(host);
	try {
		const stages: string[] = [];
		await render(
			{
				renderCsr: () => {
					const fragment = document.createDocumentFragment();
					const header = document.createElement('header');
					header.setAttribute('data-held-fragment', '');
					header.textContent = 'held';
					const section = document.createElement('section');
					section.textContent = 'body';
					fragment.append(header, section);
					return { root: fragment as never };
				},
			} as never,
			{
				target: host,
				beforeMount: () => {
					stages.push(`beforeMount:mounted=${String(host.children.length > 0)}`);
				},
			},
		);
		expect(stages).toEqual(['beforeMount:mounted=false']);
		const holder = host.querySelector<HTMLElement>('[data-markless-route-holder]');
		if (!holder) throw new Error('Expected the fragment holder in the DOM.');
		expect(holder.style.display).toBe('contents');
		expect(holder.querySelector('[data-held-fragment]')).not.toBeNull();
		expect(holder.querySelector('section')?.textContent).toBe('body');
	} finally {
		host.remove();
	}
});

// Spec D8 part B: a boundary that already shows settled content re-settles
// from the prior snapshot — mutation refreshes never render @pending. Uses
// the router-free harness path in resettle-latest.test.ts for the arm-level
// pin; this file owns only navigation-shaped behavior.
