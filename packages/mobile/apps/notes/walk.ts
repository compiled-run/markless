import { expect } from '@playwright/test';
import type { Walk } from '../walks.ts';

export const walkNotes: Walk = {
	async run(page, { shot }) {
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'No notes yet' })).toBeVisible();
		await shot('01-empty');

		await page.getByRole('link', { name: 'Write your first note' }).click();
		await expect(page.getByRole('heading', { name: 'New note' })).toBeVisible();
		await page.getByLabel('Title').fill('Groceries');
		await page.getByLabel('Note').fill('Milk and eggs\nCoffee beans');
		await page.getByLabel('Tag').selectOption('Shopping');
		await page.getByLabel('Pin to the top').check();
		await shot('02-new');
		await page.getByRole('button', { name: 'Save note' }).click();
		await expect(page.getByRole('heading', { name: 'Groceries' })).toBeVisible();
		await expect(page.getByText('Coffee beans')).toBeVisible();
		await shot('03-detail');

		await page.getByRole('link', { name: 'New note' }).click();
		await page.getByLabel('Title').fill('Standup');
		await page.getByLabel('Note').fill('Ship the yardstick');
		await page.getByLabel('Tag').selectOption('Work');
		await page.getByRole('button', { name: 'Save note' }).click();
		await expect(page.getByRole('heading', { name: 'Standup' })).toBeVisible();

		await page.getByRole('link', { name: 'Notes', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'All notes' })).toBeVisible();
		const cards = page.getByRole('listitem');
		await expect(cards).toHaveCount(2);
		await expect(cards.first()).toContainText('Groceries');
		await shot('04-list');

		await page.getByLabel('Search notes').fill('yard');
		await expect(cards).toHaveCount(1);
		await expect(cards.first()).toContainText('Standup');
		await page.getByLabel('Search notes').fill('zzz');
		await expect(page.getByText('No notes match “zzz”')).toBeVisible();
		await shot('05-no-match');
		await page.getByLabel('Search notes').fill('');

		await page.getByRole('link', { name: 'Tags' }).click();
		await expect(page.getByRole('heading', { name: 'Tags' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Work 1 note' })).toBeVisible();
		await shot('06-tags');
		await page.getByRole('link', { name: 'Work 1 note' }).click();
		await expect(page.getByRole('heading', { name: 'Work' })).toBeVisible();
		await page.getByRole('link', { name: /Standup/ }).click();

		await page.getByRole('link', { name: 'Edit' }).click();
		await expect(page.getByRole('heading', { name: 'Edit note' })).toBeVisible();
		await expect(page.getByLabel('Title')).toHaveValue('Standup');
		await expect(page.getByLabel('Tag')).toHaveValue('Work');
		await page.getByLabel('Title').fill('Standup notes');
		await shot('07-edit');
		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(page.getByRole('heading', { name: 'Standup notes' })).toBeVisible();
		await expect(page.getByText('Work · Edited')).toBeVisible();

		await page.reload();
		await expect(page.getByRole('heading', { name: 'Standup notes' })).toBeVisible();

		await page.getByRole('button', { name: 'Delete', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Delete this note?' });
		await expect(dialog).toBeVisible();
		await shot('08-confirm');
		await dialog.getByRole('button', { name: 'Keep it' }).click();
		await expect(dialog).toBeHidden();
		await page.getByRole('button', { name: 'Delete', exact: true }).click();
		await dialog.getByRole('button', { name: 'Delete note' }).click();
		await expect(page.getByRole('heading', { name: 'All notes' })).toBeVisible();
		await expect(cards).toHaveCount(1);
		await expect(cards.first()).toContainText('Groceries');
	},
};
