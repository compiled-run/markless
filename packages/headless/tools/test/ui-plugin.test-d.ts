import { lucide } from '@markless/ui';

type AssertCallable<T extends (...args: never[]) => unknown> = T;

export type LucideCheckIsCallable = AssertCallable<typeof lucide.check>;
