import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';
import { compileTsrxModulesWithInterfaces } from './multi-module-compile-support.ts';

// Calling a shared() method compiles by copying the method's authored body into
// the calling handler's own module. Inside the defining module that is sound:
// the text lands back in the scope it was written in. Across modules it is not,
// and it used to fail silently in two different ways — these tests are the
// refusal, not the capability. Whether cross-module method calls become
// supported (by carrying the definition's imports, or by dispatching to the
// method at runtime) is an open design question; until it is answered the build
// says so instead of shipping a handler that throws or misbehaves on the first
// gesture.
//
// This is not the same question as `namespace-shared-call.test.ts`, which pins
// resolving the DEFINITION from another module — `family.state()` reaching the
// definition record through a barrel. That resolution is meant to work and its
// tests never call a method of the resolved instance. What is refused here is
// the method CALL on the resolved instance, which is a later step and a
// different mechanism: definition resolution moves a record, method inlining
// moves source text.

const familyHelpers = `
export function announce(text) {
	return '[' + text + ']';
}
`;

const family = `
import { shared, state } from '@markless/core';
import { announce } from './family-helpers.ts';

export const toaster = shared(() => {
	const s = state({ label: '' });
	return {
		...s,
		show(text) {
			s.label = announce(text);
		},
	};
}, { scope: 'widget' });

export default function Family() @{
	const s = toaster();
	<div data-family>
		<button onClick={() => s.show('own')}>own</button>
		{s.label}
	</div>
}
`;

const consumerHelpers = `
export function announce(text) {
	return 'consumer:' + text;
}
`;

const CROSS_MODULE_CODE = 'MARKLESS_SHARED_METHOD_CROSS_MODULE';

function errors(compiled: Parameters<typeof collectTsrxModuleDiagnostics>[0]) {
	return collectTsrxModuleDiagnostics(compiled).filter((item) => item.severity === 'error');
}

async function compileWithFamily(consumerFilename: string, consumerSource: string) {
	const results = await compileTsrxModulesWithInterfaces([
		{
			filename: 'src/family-helpers.ts',
			source: familyHelpers,
			importSource: './family-helpers.ts',
		},
		{
			filename: 'src/consumer-helpers.ts',
			source: consumerHelpers,
			importSource: './consumer-helpers.ts',
		},
		{ filename: 'src/family.tsrx', source: family, importSource: './family.tsrx' },
		{ filename: consumerFilename, source: consumerSource },
	]);
	const consumer = results.at(-1);
	if (!consumer) throw new Error('the consumer module did not compile');
	return { consumer, familyModule: results[2]! };
}

// The non-regression that matters most: the defining module calls its own
// method the same way, and that call still compiles and still lowers the write
// the method performs into a graph write.
test('the family module still inlines its own shared() method', async () => {
	const { familyModule } = await compileWithFamily(
		'src/unused.tsrx',
		`export default function Page() @{ <span>x</span> }`,
	);

	expect(errors(familyModule)).toEqual([]);
	const handler = familyModule.symbolModules.modules.find(
		(item) => item.kind === 'event-handler',
	);
	// The body was copied in, the write it performs was lowered, and the import
	// the body needs travelled with it, because all three live in one file.
	expect(handler?.source).toContain('context.graph.write(');
	expect(handler?.source).toContain('shared:src/family.tsrx#toaster/state:s');
	expect(handler?.source).toContain('from "./family-helpers.ts"');
});

// Shape one: the definition module's own import does not travel with the copied
// body, so the emitted module names something nothing binds. Before the
// refusal this compiled clean and threw a ReferenceError on the first click.
test('a consumer calling a shared() method is refused, naming the absent identifier', async () => {
	const { consumer } = await compileWithFamily(
		'src/absent.tsrx',
		`
import { toaster } from './family.tsrx';

export default function Page() @{
	const s = toaster();
	<button onClick={() => s.show('hi')}>go</button>
}
`,
	);

	const refusals = errors(consumer).filter((item) => item.code === CROSS_MODULE_CODE);
	expect(refusals.length).toBeGreaterThan(0);
	const named = refusals.map((item) => item.message).join('\n');
	// The identifier the copied body expects and this module never binds.
	expect(named).toContain('"announce"');
	// The call that dragged it in, and the file it came from.
	expect(named).toContain('s.show()');
	expect(named).toContain('src/family.tsrx');
	// The refusal says plainly what is not supported, and offers the interim.
	expect(refusals[0]?.title).toContain('cannot be called from another module yet');
	expect(refusals[0]?.suggestions.map((item) => item.message).join('\n')).toContain(
		'src/family.tsrx',
	);
});

// Shape two: the consumer owns a binding with the same local name, so the
// import filter matches it against the copied text and carries it in. The
// emitted module then calls the CONSUMER's `announce` from the family's body —
// no crash, no diagnostic, just the wrong function. That is the worse half.
test('a consumer import captured by the copied body is refused as a capture', async () => {
	const { consumer } = await compileWithFamily(
		'src/capture.tsrx',
		`
import { toaster } from './family.tsrx';
import { announce } from './consumer-helpers.ts';

export default function Page() @{
	const s = toaster();
	<button onClick={() => { announce('local'); s.show('hi'); }}>go</button>
}
`,
	);

	const refusals = errors(consumer).filter((item) => item.code === CROSS_MODULE_CODE);
	const captured = refusals.filter((item) => item.message.includes('matched against that copied'));
	expect(captured.length).toBeGreaterThan(0);
	expect(captured[0]?.message).toContain('"announce"');
	expect(captured[0]?.message).toContain('src/family.tsrx');
	// The emitted module really did carry the consumer's import into the family's
	// body — the fact the refusal is about.
	const handler = consumer.symbolModules.modules.find((item) => item.kind === 'event-handler');
	expect(handler?.source).toContain('from "./consumer-helpers.ts"');
});

// A callback prop is inlined by the same code path as an event handler, so the
// same refusal has to reach it.
test('a callback prop calling a foreign shared() method is refused too', async () => {
	const child = `
export default function Child({ onPick }) @{
	<button onClick={onPick}>pick</button>
}
`;
	const results = await compileTsrxModulesWithInterfaces([
		{
			filename: 'src/family-helpers.ts',
			source: familyHelpers,
			importSource: './family-helpers.ts',
		},
		{ filename: 'src/family.tsrx', source: family, importSource: './family.tsrx' },
		{ filename: 'src/child.tsrx', source: child, importSource: './child.tsrx' },
		{
			filename: 'src/callback.tsrx',
			source: `
import Child from './child.tsrx';
import { toaster } from './family.tsrx';

export default function Page() @{
	const s = toaster();
	<Child onPick={() => s.show('hi')} />
}
`,
		},
	]);

	const refusals = errors(results.at(-1)!).filter((item) => item.code === CROSS_MODULE_CODE);
	expect(refusals.length).toBeGreaterThan(0);
	expect(refusals.map((item) => item.message).join('\n')).toContain('"announce"');
});

// A module that calls no shared() method of another file is untouched: the
// inversion is keyed on the mark, not on there being a shared() anywhere.
test('a consumer that only reads the shared instance still compiles', async () => {
	const { consumer } = await compileWithFamily(
		'src/read-only.tsrx',
		`
import { toaster } from './family.tsrx';

export default function Page() @{
	const s = toaster();
	<span data-label>{s.label}</span>
}
`,
	);

	expect(errors(consumer)).toEqual([]);
});

// F1b. Exporting a plain function that resolves a shared() definition used to
// compile: the carry into symbol modules quietly stripped its `export`, and the
// private copy that survived called a definition that is not carried as code at
// all. Both halves are stated instead of performed.
test('an exported module-level function that resolves a shared() definition is refused', async () => {
	const compiled = await compileTsrxModule({
		filename: 'src/leaky.tsrx',
		source: `
import { shared, state } from '@markless/core';

export const toaster = shared(() => {
	const s = state({ label: '' });
	return { ...s, show(text) { s.label = text; } };
}, { scope: 'widget' });

export function showFromAnywhere(text) {
	const s = toaster();
	s.show(text);
}

export default function Family() @{
	const s = toaster();
	<div data-family>{s.label}</div>
}
`,
		symbols: [],
	});

	const refusal = errors(compiled).find(
		(item) => item.code === 'MARKLESS_SHARED_INSTANCE_EXPORTED_FUNCTION',
	);
	expect(refusal?.severity).toBe('error');
	expect(refusal?.message).toContain('showFromAnywhere');
	expect(refusal?.message).toContain('toaster()');
	// It names the drop: the export goes away and the definition is not carried.
	expect(refusal?.message).toContain('export');
});

// The component next to it is the shape that DOES work, and it must stay
// working — a component body resolving the same definition is the supported
// spelling, and the refusal above must not reach it.
test('a component body resolving the same definition is not refused', async () => {
	const compiled = await compileTsrxModule({
		filename: 'src/clean.tsrx',
		source: `
import { shared, state } from '@markless/core';

export const toaster = shared(() => {
	const s = state({ label: '' });
	return { ...s, show(text) { s.label = text; } };
}, { scope: 'widget' });

export function Named() @{
	const s = toaster();
	<span data-named>{s.label}</span>
}

export default function Family() @{
	const s = toaster();
	<div data-family>
		<button onClick={() => s.show('x')}>go</button>
		{s.label}
	</div>
}
`,
		symbols: [],
	});

	expect(errors(compiled)).toEqual([]);
});
