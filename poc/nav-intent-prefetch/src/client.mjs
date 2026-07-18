import { createDestinationPrestart } from './prefetch.mjs';

const parameters = new URLSearchParams(location.search);
const run = parameters.get('run');
const mode = parameters.get('mode');
if (!run || !['prefetch', 'plain'].includes(mode)) throw new Error('Expected run and mode');
globalThis.__navIntentRun = run;

const link = document.querySelector('[data-route-b]');
let destination;

if (mode === 'prefetch') {
	link.addEventListener('pointerdown', () => {
		destination ??= prestartDestination();
	});
}

link.addEventListener('click', async (event) => {
	event.preventDefault();
	if (mode === 'prefetch') {
		destination ??= prestartDestination();
		const controller = await destination;
		await controller.allStarted;
		await waitForNetworkArrivals(controller.asyncComputedIds.length);
		await renderDestination(controller);
	} else {
		await recordRenderStart();
		destination = prestartDestination();
		await showDestination(await destination);
	}
});

async function prestartDestination() {
	const compiled = await import('./route-b-artifact.mjs');
	const controller = createDestinationPrestart(compiled);
	await fetch(`/api/_derived?run=${encodeURIComponent(run)}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ asyncComputedIds: controller.asyncComputedIds }),
	});
	return controller;
}

async function renderDestination(controller) {
	await recordRenderStart();
	await showDestination(controller);
}

async function showDestination(controller) {
	document.querySelector('#app').innerHTML =
		'<main data-destination><h1>Destination render began</h1><p data-pending>Loading compiled async data</p></main>';
	await controller.settled;
	const recommendations = controller.value('computed:recommendations');
	const catalog = controller.value('computed:catalog');
	document.querySelector('[data-destination]').innerHTML =
		`<h1>Destination ready</h1><p data-recommendations>${escapeHtml(recommendations.items.join(', '))}</p><p data-catalog>${escapeHtml(catalog.title)}</p>`;
}

async function recordRenderStart() {
	const response = await fetch(`/api/_render-start?run=${encodeURIComponent(run)}`, {
		method: 'POST',
	});
	if (!response.ok) throw new Error(`render-start receipt failed: ${response.status}`);
}

async function waitForNetworkArrivals(expected) {
	for (let attempt = 0; attempt < 100; attempt++) {
		const response = await fetch(`/api/_timeline?run=${encodeURIComponent(run)}`);
		const timeline = await response.json();
		if (timeline.events.length === expected) return;
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
	throw new Error(`Timed out waiting for ${expected} derived fetch arrivals`);
}

function escapeHtml(value) {
	return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

globalThis.__navIntentReady = true;
