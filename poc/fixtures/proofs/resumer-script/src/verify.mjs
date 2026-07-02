import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
	createInteractiveDocument,
	renderEventOnlySsrHtml,
	renderStaticSsrHtml,
} from './fixture.mjs';
import { measureEventOnlyResumer } from './size-report.mjs';

const staticHtml = renderStaticSsrHtml();
assert.equal(
	staticHtml.includes('data-async-resumer'),
	false,
	'static SSR must not emit the inline resumer',
);
assert.equal(
	staticHtml.includes('type="markless/view"'),
	false,
	'static SSR without browser triggers must not emit markless/view wiring',
);

const interactiveHtml = renderEventOnlySsrHtml();
assert.equal(
	interactiveHtml.includes('data-async-resumer'),
	true,
	'event-only SSR must emit one inline resumer',
);
assert.equal(
	interactiveHtml.includes('on:click'),
	false,
	'event wiring must not use per-node event attributes',
);
assert.equal(
	interactiveHtml.includes('q-'),
	false,
	'event wiring must not use QRL-style per-node attributes',
);
assert.equal(
	interactiveHtml.includes('hyd' + 'rate'),
	false,
	'event-only resumer proof must not use client replay vocabulary',
);

const proof = await createInteractiveDocument();
await proof.runStartup();

assert.deepEqual(proof.executions(), {
	componentBodies: 0,
	appModules: 0,
	symbolModules: 0,
	handlers: 0,
});
assert.deepEqual(
	proof.receipts().map((receipt) => receipt.stage),
	['listener-installed'],
	'startup should only install the delegated listener',
);
assert.equal(proof.receipts()[0].capture, true, 'delegated listener must use capture phase');
assert.equal(proof.buttonText(), 'Count 0');

await proof.clickButton();

assert.deepEqual(proof.executions(), {
	componentBodies: 0,
	appModules: 0,
	symbolModules: 1,
	handlers: 1,
});
assert.equal(proof.buttonText(), 'Count 1');
assert.equal(proof.rootAttribute('data-count'), '1');
assert.deepEqual(
	proof.receipts().map((receipt) => receipt.stage),
	['listener-installed', 'lazy-symbol-loaded', 'handler-run'],
);

const size = measureEventOnlyResumer();
const browserHtml = await readFile(new URL('../browser/index.html', import.meta.url), 'utf8');
assert.ok(
	browserHtml.includes(size.minified),
	'Witness browser fixture must use the measured minified resumer',
);
assert.equal(size.targetBytes, 700);
assert.ok(size.rawBytes > 0, 'raw byte count must be recorded');
assert.ok(size.minifiedBytes > 0, 'minified byte count must be recorded');
assert.ok(size.gzipBytes > 0, 'gzip byte count must be recorded');
assert.ok(
	size.gzipBytes <= size.targetBytes,
	`event-only resumer gzip size ${size.gzipBytes} B must stay <= ${size.targetBytes} B`,
);

console.log(
	JSON.stringify(
		{
			ok: true,
			receipts: proof.receipts(),
			size,
		},
		null,
		2,
	),
);
