import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
const results = { documents: [], errors: [], steps: [] };
try {
	const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
	page.setDefaultTimeout(30_000);
	page.on('pageerror', error => results.errors.push(error.message));
	page.on('request', request => {
		if (request.resourceType() === 'document') results.documents.push(request.url());
	});
	await page.goto('http://127.0.0.1:4488/markless/');
	const header = await page.locator('.site-header').elementHandle();
	await page.locator('.sidebar a[href="/markless/start/first-app"]').click();
	await expect(page.locator('h1')).toHaveText('One command, then three scripts');
	results.steps.push('destination rendered');
	await page.goBack();
	await expect(page.locator('h1')).toHaveText('The compiler for user interfaces');
	results.steps.push('back rendered home');
	await page.goForward();
	await expect(page.locator('h1')).toHaveText('One command, then three scripts');
	results.steps.push('forward rendered destination');
	if (!(await header.evaluate(node => node.isConnected))) throw new Error('Document shell was replaced');
	if (results.documents.length !== 1 || results.errors.length) throw new Error(JSON.stringify(results));
	await writeFile(new URL('./history-result.json', import.meta.url), JSON.stringify(results, null, 2));
	console.log(JSON.stringify(results));
} finally {
	await browser.close();
}
