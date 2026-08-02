import { expect, test, vi } from 'vitest';
import { assertMusicPlayerPrerenderedShell } from '../../../demos/music-player/src/prerender-shell.ts';

test('music player prerender boot fails loudly when the built shell was not prerendered', () => {
	const error = vi.spyOn(console, 'error').mockImplementation(() => {});
	const placeholder = {};
	const document = {
		querySelector: (selector: string) => (selector === '#app' ? placeholder : null),
	};

	expect(() => assertMusicPlayerPrerenderedShell(document)).toThrow(
		'MARKLESS_PRERENDER_SHELL_MISSING',
	);
	expect(error).toHaveBeenCalledOnce();
	expect(error.mock.calls[0]?.[0]).toMatchObject({
		code: 'MARKLESS_PRERENDER_SHELL_MISSING',
	});

	error.mockRestore();
});

test('music player prerender boot accepts the emitted resumable shell marker', () => {
	const marker = {};
	const document = {
		querySelector: (selector: string) =>
			selector === '[data-async-resumer][data-markless-resume-module]' ? marker : null,
	};

	expect(() => assertMusicPlayerPrerenderedShell(document)).not.toThrow();
});
