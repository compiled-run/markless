import { afterEach, expect, test } from 'vitest';
import { dispatchRouteUpdate, startRouteUpdateRenderer } from '@markless/core/router';
import { render } from '@markless/web/render';
import AlphaPage from './fixtures/nav-page-alpha.tsrx';
import BetaPage from './fixtures/nav-page-beta.tsrx';
import SlowPage from './fixtures/nav-page-slow.tsrx';

// T110 / spec D8 navigation transitions: a client route swap holds the
// outgoing page LIVE AND INTERACTIVE while the destination renders and its
// boundary runners settle. Fast destinations commit in ONE swap with no
// @pending frame; slow destinations show honest pending UI only after the
// navigation deadline, and once shown it stays the minimum duration.
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
	const record = () => samples.push({ at: performance.now(), html: routeDocument.body.innerHTML });
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
		route: { file: `pages${pathname}.tsrx`, params: {}, status: 200, url: `http://localhost${pathname}` },
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

test('fast route swap: no pending frame, one swap, outgoing page stays interactive', async () => {
	const routeDocument = createRouteDocument();

	navigateTo(routeDocument, AlphaPage, '/alpha');
	await waitForBody(routeDocument, (html) => html.includes('data-nav-settled="alpha"'), 3000, 'alpha settle');

	const sampler = sampleBody(routeDocument);
	navigateTo(routeDocument, BetaPage, '/beta');

	// The outgoing page must still be live: click its counter DURING the hold.
	const tap = routeDocument.querySelector<HTMLButtonElement>('button[data-alpha-tap]');
	if (!tap) throw new Error('Expected the alpha tap button in the live DOM.');
	tap.click();

	await waitForBody(routeDocument, (html) => html.includes('data-nav-settled="beta"'), 3000, 'beta settle');
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
	await waitForBody(routeDocument, (html) => html.includes('data-nav-settled="alpha"'), 3000, 'alpha settle');

	const sampler = sampleBody(routeDocument);
	const dispatchedAt = navigateTo(routeDocument, SlowPage, '/slow');

	// Interactive well inside the deadline window.
	const tap = routeDocument.querySelector<HTMLButtonElement>('button[data-alpha-tap]');
	if (!tap) throw new Error('Expected the alpha tap button in the live DOM.');
	tap.click();

	await waitForBody(routeDocument, (html) => html.includes('data-nav-settled="slow"'), 5000, 'slow settle');
	sampler.stop();

	const pending = firstSampleWith(sampler.samples, 'data-nav-pending="slow"');
	const settled = firstSampleWith(sampler.samples, 'data-nav-settled="slow"');
	if (!pending) throw new Error('Expected honest pending UI for the slow destination.');
	if (!settled) throw new Error('Expected the slow destination to settle.');

	// The swap held the outgoing page until the navigation deadline.
	expect(pending.at - dispatchedAt).toBeGreaterThanOrEqual(240);
	// Once shown, pending UI stays at least the minimum duration (no blink).
	expect(settled.at - pending.at).toBeGreaterThanOrEqual(185);
	expect(settled.at - pending.at).toBeLessThan(1000);

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
