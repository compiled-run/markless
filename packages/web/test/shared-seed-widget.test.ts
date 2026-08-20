import { expect, test } from 'vitest';
import { MARKLESS_WIDGET_INSTANCE_KEY } from '../src/prerender/shared-seed-slot.ts';

// The compiler emits this exact key into every seed map a widget root hands its
// parts (MARKLESS_WIDGET_INSTANCE_KEY in @markless/compiler's public-render
// residue-reader), and the browser answers minted element() ids from it without
// importing the compiler. Pinning the literal on this side makes a one-sided
// rename fail here; element-handle-idref.test.ts proves the two sides agree end
// to end, with two widgets on one page minting different trigger ids.
test('the widget-instance seed key is the one string both sides spell', () => {
	expect(MARKLESS_WIDGET_INSTANCE_KEY).toBe('markless:widget-instance');
});
