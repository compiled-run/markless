import { expect } from '@playwright/test';
import type { Walk } from '../walks.ts';

export const walkShop: Walk = {
	async run(page, { shot }) {
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'New this week' })).toBeVisible();
		const cards = page.getByRole('main').getByRole('listitem');
		await expect(cards).toHaveCount(8);
		await expect(cards.first()).toContainText('Desk lamp');
		await expect
			.poll(() =>
				page
					.locator('main img')
					.first()
					.evaluate((image: HTMLImageElement) => image.naturalWidth),
			)
			.toBeGreaterThan(0);
		await shot('01-home');

		let productRequests = 0;
		page.on('request', (request) => {
			if (new URL(request.url()).pathname === '/api/products') productRequests++;
		});
		await page.getByRole('button', { name: 'Refresh' }).click();
		await expect.poll(() => productRequests).toBe(1);
		await expect(cards).toHaveCount(8);

		await page.getByRole('link', { name: /Copper kettle/ }).click();
		await expect(page.getByRole('heading', { name: 'Copper kettle' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Add to cart' })).toBeDisabled();
		await shot('02-product');
		await page.getByRole('button', { name: 'Choose option' }).click();
		const sheet = page.getByRole('dialog', { name: 'Choose an option' });
		await expect(sheet).toBeVisible();
		await shot('03-options');
		await sheet.getByRole('button', { name: '2 litres' }).click();
		await expect(sheet).toBeHidden();
		await expect(page.getByRole('button', { name: '2 litres' })).toBeVisible();
		await page.getByRole('button', { name: 'Add to cart' }).click();
		await expect(page.getByText('Added to your cart')).toBeVisible();
		await expect(page.getByLabel('1 in cart')).toBeVisible();
		await page.getByRole('button', { name: 'Add to cart' }).click();
		await expect(page.getByLabel('2 in cart')).toBeVisible();

		await page.getByRole('link', { name: 'Categories' }).click();
		await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible();
		await shot('04-categories');
		await page.getByRole('link', { name: /Outdoor/ }).click();
		await expect(page.getByRole('heading', { name: 'Outdoor' })).toBeVisible();
		await expect(cards).toHaveCount(2);
		await page.getByRole('link', { name: /Camp lantern/ }).click();
		await page.getByRole('button', { name: 'Choose option' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Warm' }).click();
		await page.getByRole('button', { name: 'Add to cart' }).click();
		await expect(page.getByLabel('3 in cart')).toBeVisible();

		await page.getByRole('link', { name: 'Categories' }).click();
		await page.getByRole('link', { name: /Clearance/ }).click();
		await expect(page.getByRole('main').getByRole('alert')).toContainText(
			'Clearance is closed while we restock.',
		);
		await shot('05-error');

		await page.getByRole('link', { name: /^Cart/ }).click();
		await expect(page.getByRole('heading', { name: 'Cart' })).toBeVisible();
		await expect(page.getByText('Total £157.00')).toBeVisible();
		await shot('06-cart');
		await page.getByRole('button', { name: 'One fewer Copper kettle' }).click();
		await expect(page.getByText('Total £93.00')).toBeVisible();
		await expect(page.getByLabel('2 in cart')).toBeVisible();
		await page.getByRole('button', { name: 'Place order' }).click();
		await expect(page.getByRole('heading', { name: /^Order \d+ placed$/ })).toBeVisible();
		await expect(page.getByText('1 × Copper kettle (2 litres)')).toBeVisible();
		await shot('07-order');

		await page.getByRole('link', { name: 'Account' }).click();
		await expect(page.getByRole('link', { name: /^Order \d+$/ })).toHaveCount(1);
		await page.getByRole('link', { name: /^Cart/ }).click();
		await expect(page.getByText('Your cart is empty.')).toBeVisible();
	},
};
