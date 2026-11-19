import type { BrowserContext, BrowserContextOptions, Page } from '@playwright/test';
import { walkCheckin } from './checkin/walk.ts';
import { walkNotes } from './notes/walk.ts';
import { walkShop } from './shop/walk.ts';

export type WalkTools = {
	readonly context: BrowserContext;
	/** Saves a screenshot under this name when screenshots are asked for, to read beside the phones'. */
	readonly shot: (name: string) => Promise<void>;
};

export type Walk = {
	readonly context?: BrowserContextOptions;
	readonly run: (page: Page, tools: WalkTools) => Promise<void>;
};

export const walks: Record<'notes' | 'shop' | 'checkin', Walk> = {
	notes: walkNotes,
	shop: walkShop,
	checkin: walkCheckin,
};
