import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import FirstReject from './first-reject.tsrx';

// The @catch (error) binding reaches the arm's markup through the arm chunk's read context.
afterEach(() => cleanup());

test('a client-rendered @catch (error) reads the rejection', async () => {
	const screen = await render(FirstReject);
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelector('[data-failed]')?.textContent, { timeout: 3_000 }).toBe('Account closed');
});

test('a server-rendered @catch (error) reads the rejection', async () => {
	const screen = await renderSSR(FirstReject);
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelector('[data-failed]')?.textContent, { timeout: 3_000 }).toBe('Account closed');
});
