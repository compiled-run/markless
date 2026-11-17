// Builds the five Q1 sheets from _common.d.ts plus each variant's header and extras.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const dir = join(dirname(new URL(import.meta.url).pathname), '..', 'q1', 'sheets');
const common = readFileSync(join(dir, '_common.d.ts'), 'utf8');
const builds = `// Module: @markless/device
// The app is built from one codebase as an iPhone app, an Android app, a Mac app and a website.
// Device features exist in the iPhone and Android builds only.
`;
const plain = { cam: `(options?: { facing?: 'front' | 'back' }) => Camera`, geo: `() => Geolocation`, net: `() => Network`, field: '' };
const sup = {
	cam: `{ (options?: { facing?: 'front' | 'back' }): Camera; readonly supported: boolean }`,
	geo: `{ (): Geolocation; readonly supported: boolean }`,
	net: `{ (): Network; readonly supported: boolean }`,
	field: `\n\treadonly supported: boolean;`,
};
const modifierKey = `
// '⌘' for a person on an Apple system, 'Ctrl' otherwise. Works in every build; on the website it reads the visitor's system.
export declare const modifierKey: '⌘' | 'Ctrl';
`;
const platform = `
// Which build this is, fixed when the app is built. Exactly one field is true. In the website build \`web\` is true
// whatever system the visitor uses.
export declare const platform: { readonly ios: boolean; readonly android: boolean; readonly macos: boolean; readonly web: boolean };
`;
const supportedRule = `// Each feature has \`supported\`: true in a build where the feature exists, false elsewhere.
// A guard is an \`@if\` whose test is \`feature.supported\` or starts with \`feature.supported &&\`, or the same test in a
// handler (\`if\`, or an early \`if (!feature.supported) return;\`). Other builds remove the guarded code; an \`@else\` arm
// is what they get.
`;
const rejectRule = `// Making a feature object (\`const cam = camera()\`) may stand anywhere. The build rejects any unguarded use whose result
// the page shows or waits for: reading a field, awaiting a method, showing its element. A call that returns nothing
// (\`haptics.tap()\`) needs no guard; where the feature does not exist it does nothing.
`;
const variants = {
	HN: { head: `// In other builds the build removes device features and your code needs nothing for that: an element such as
// <base.camera> shows nothing, fields keep their starting values (ready false, position null, access 'unknown',
// online true), a method that returns nothing does nothing, and a promise a method returns never settles.
`, shape: plain, extra: modifierKey },
	QT: { head: supportedRule + rejectRule, shape: sup, extra: modifierKey },
	VR: { head: `// A guard is an \`@if\` whose test is \`platform.ios || platform.android\` or starts with \`(platform.ios || platform.android) &&\`,
// or the same test in a handler (\`if\`, or an early return). Other builds remove the guarded code; an \`@else\` arm is what
// they get.
` + rejectRule, shape: plain, extra: platform },
	LX: { head: `// In other builds each feature still imports, but making its object (camera(), geolocation(), network()) throws an Error
// named 'NotSupportedError', haptics.tap() throws it, and sharesheet.open() rejects with it. A throw while a component
// body runs is caught by the nearest enclosing @try's @catch, like any other error.
`, shape: plain, extra: modifierKey },
	GP: { head: supportedRule + rejectRule + `// For a difference in the page that is not a device feature, use \`platform\`.
`, shape: sup, extra: platform },
};
for (const [label, v] of Object.entries(variants)) {
	const body = common
		.replace('SUPPORTED_CAMERA', v.shape.cam).replace('SUPPORTED_GEO', v.shape.geo).replace('SUPPORTED_NET', v.shape.net)
		.replaceAll('SUPPORTED_FIELD', v.shape.field);
	writeFileSync(join(dir, `${label}.d.ts`), builds + v.head + body + v.extra);
}
writeFileSync(join(dir, 'ui.d.ts'), `// Module: @markless/ui (excerpt)
import type { Camera } from '@markless/device';
export declare const base: {
	// Shows a camera made in this component.
	camera: (props: { el: Camera; class?: string }) => Element;
};
`);
