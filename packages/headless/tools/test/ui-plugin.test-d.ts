import { lucide } from '@markless/ui';
import { test } from 'vitest';

type AssertCallable<T extends (...args: never[]) => unknown> = T;

export type LucideCheckIsCallable = AssertCallable<typeof lucide.check>;

test('a lucide icon export is callable', () => {
	lucide.check satisfies LucideCheckIsCallable;
});
