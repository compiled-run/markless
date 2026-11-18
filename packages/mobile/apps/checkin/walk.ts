import { expect } from '@playwright/test';
import type { Walk } from '../walks.ts';

// A 2 by 2 PNG: the photo a person picks from the file chooser.
const PHOTO = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNgYGD4z8DAwMDAwMDAAAAhAAF1hK9VAAAAAElFTkSuQmCC',
	'base64',
);

export const walkCheckin: Walk = {
	context: {
		permissions: ['geolocation', 'clipboard-read', 'clipboard-write'],
		geolocation: { latitude: 51.5074, longitude: -0.1278 },
	},
	async run(page, { context, shot }) {
		await page.goto('/');
		await expect(page.getByText('No check-ins yet.')).toBeVisible();
		await shot('01-empty');

		await page.getByRole('link', { name: 'New check-in' }).click();
		await expect(page.getByRole('heading', { name: 'New check-in' })).toBeVisible();
		await page.getByLabel('Site').selectOption('Pump house');
		await page
			.getByLabel('Add a photo')
			.setInputFiles({ name: 'site.png', mimeType: 'image/png', buffer: PHOTO });
		await expect(page.getByRole('img', { name: 'The photo for this check-in' })).toBeVisible();
		await page.getByRole('button', { name: 'Use my location' }).click();
		await expect(page.getByText('51.50740, -0.12780')).toBeVisible();
		await page.getByLabel('Note').fill('Gauge reads 4 bar');
		await shot('02-new');
		await page.getByRole('button', { name: 'Save check-in' }).click();

		await expect(page.getByRole('heading', { name: 'Pump house' })).toBeVisible();
		await expect(page.getByRole('img', { name: 'Photo at Pump house' })).toBeVisible();
		await expect(page.getByText('Gauge reads 4 bar')).toBeVisible();
		await page.getByRole('button', { name: 'Share' }).click();
		await expect(page.getByText('Link copied')).toBeVisible();
		await expect
			.poll(() => page.evaluate(() => navigator.clipboard.readText()))
			.toMatch(/\/checkins\/\w+$/);
		await shot('03-detail');

		await page.getByRole('link', { name: 'All check-ins' }).click();
		await expect(page.getByRole('link', { name: /Pump house/ })).toBeVisible();
		await shot('04-list');

		await page.getByRole('link', { name: 'Settings' }).click();
		await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
		const reminder = page.getByRole('switch', { name: 'End-of-day reminder' });
		await expect(reminder).toHaveAttribute('aria-checked', 'false');
		await reminder.click();
		await expect(reminder).toHaveAttribute('aria-checked', 'true');
		await page.getByText('Full', { exact: true }).click();
		await expect(page.getByRole('radio', { name: 'Full' })).toBeChecked();
		await page.getByRole('button', { name: 'Default site' }).click();
		await page.getByRole('option', { name: 'East fence' }).click();
		await expect(page.locator('.current')).toHaveText('East fence');
		await page.getByText('Dark', { exact: true }).click();
		await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
		await shot('05-settings');

		await page.reload();
		await expect(page.getByRole('switch', { name: 'End-of-day reminder' })).toHaveAttribute(
			'aria-checked',
			'true',
		);
		await expect(page.getByRole('radio', { name: 'Full' })).toBeChecked();
		await expect(page.locator('.current')).toHaveText('East fence');
		await page.getByText('System', { exact: true }).click();

		await page.getByRole('link', { name: 'Access' }).click();
		await expect(page.getByRole('heading', { name: 'Access' })).toBeVisible();
		await expect(page.locator('dd').nth(1)).toHaveText('Allowed');
		await shot('06-access');

		await context.clearPermissions();
		await page.getByRole('link', { name: 'Field notes' }).click();
		await page.getByRole('link', { name: 'New check-in' }).click();
		await expect(page.getByLabel('Site')).toHaveValue('East fence');
		await page.getByRole('button', { name: 'Use my location' }).click();
		await expect(
			page.getByText('Location is blocked for this site.', { exact: false }),
		).toBeVisible();
		await shot('07-location-denied');
	},
};
