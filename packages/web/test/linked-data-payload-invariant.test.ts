import { expect, test, vi } from 'vitest';
import { resumeFromPayloadDocumentWith } from '../src/payload-document-common.ts';

test('linked render-data boot fails before reading payload-document scripts', async () => {
	const querySelector = vi.fn(() => null);
	const resume = vi.fn();
	const root = { __marklessLinkedRenderDataBoot: true };

	const failure = await resumeFromPayloadDocumentWith(
		{
			document: { querySelector },
			root,
			loadSymbol: async () => undefined,
		},
		resume,
	).catch((error: unknown) => error);

	expect(failure).toBeInstanceOf(Error);
	expect((failure as Error).message).toBe(
		'MARKLESS_LINKED_RENDER_DATA_PAYLOAD_ACCESS: linked render-data wake must not read markless/state or markless/view payload scripts.',
	);
	expect((failure as Error).stack).toContain('assertPayloadDocumentAccessAllowed');
	expect(querySelector).not.toHaveBeenCalled();
	expect(resume).not.toHaveBeenCalled();
});
