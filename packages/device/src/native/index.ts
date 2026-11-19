import type { SheetProps } from './sheet-types.ts';

// The platform's own pieces. None exists on the web: a web build refuses a `native.*` element outside a `platform`
// check and removes a guarded one, so nothing here reaches web output.
const absent = (name: string) => (_props: object): never => {
	throw Object.assign(new Error(`native.${name} does not exist on the web`), { name: 'NotSupportedError' });
};

/** The system sheet: iOS's sheet presentation, Android's Material bottom sheet. Absent on the web. */
export const sheet: (props: SheetProps) => never = absent('sheet');

export type { SheetProps } from './sheet-types.ts';
