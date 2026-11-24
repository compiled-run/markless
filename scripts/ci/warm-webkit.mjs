// A runner's first WebKit page reads the install and fills its caches cold (3 to 13 s, twice past 30 s, against under 1 s for every later page in the job); pay it before any test's window.
import { createServer } from 'node:http';
import { webkit } from '@playwright/test';
import { consoleOwnerUid, consoleSessionProblem } from './console-session.mjs';

const noScreen = consoleSessionProblem(process.platform, consoleOwnerUid());
if (noScreen) {
	console.error(`warm-webkit: ${noScreen}`);
	process.exit(1);
}

const html =
	'<!doctype html><title>warm</title><p>warm</p><script type="module">document.body.dataset.ready = "true";</script>';
const server = createServer((_request, response) => {
	response.setHeader('Content-Type', 'text/html;charset=utf-8');
	response.end(html);
});
await new Promise((listening) => server.listen(0, '127.0.0.1', listening));

const started = performance.now();
const browser = await webkit.launch();
try {
	const page = await browser.newPage();
	await page.goto(`http://127.0.0.1:${server.address().port}/`);
	await page.waitForFunction(() => document.body.dataset.ready === 'true');
} finally {
	await browser.close();
	server.closeAllConnections();
	server.close();
}
console.log(
	`warm-webkit: launched and showed a first page in ${Math.round(performance.now() - started)} ms`,
);
