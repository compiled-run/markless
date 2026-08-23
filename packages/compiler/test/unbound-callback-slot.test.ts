import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE } from '../src/passes/symbol-modules.ts';

// The widget family of `widget-callback-slot.test.ts`, with `box.onChange` filled
// by the root's own callback prop. Dropping that one line is the whole defect:
// the method still dispatches through `box.onChange?.(next)`, but no component in
// the module answers the slot.
const BOUND_FAMILY_SOURCE = `import { shared, state } from '@markless/core';
export const boxState = shared(
	() => {
		const box = state({ checked: false });
		return {
			...box,
			onChange: undefined as ((next: boolean) => void) | undefined,
			toggle() {
				const next = box.checked === true ? false : true;
				box.checked = next;
				box.onChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

export function BoxRoot({ checked = false, onChange, children }) @{
	const box = boxState();
	box.onChange = onChange;
	box.checked = checked;

	<div ui-checked={box.checked}>{children}</div>
}

export function BoxTrigger({ children }) @{
	const box = boxState();

	<button onClick={() => box.toggle()}>{children}</button>
}`;

const UNBOUND_FAMILY_SOURCE = BOUND_FAMILY_SOURCE.replace('\tbox.onChange = onChange;\n', '');

async function compileFamily(source: string) {
	return compileTsrxModule({ filename: 'src/box.tsrx', source, symbols: [] });
}

function handlerModuleSource(compiled: Awaited<ReturnType<typeof compileFamily>>): string {
	return (
		compiled.symbolModules.modules.find((module) => module.kind === 'event-handler')?.source ?? ''
	);
}

/**
 * The module's code with its string literals blanked. Graph node ids carry the
 * authored file and binding names — `"shared:src/box.tsrx#boxState/state:box"` —
 * so a bare name search over the raw source can never tell a lowered read from a
 * surviving reference.
 */
function codeOutsideStrings(source: string): string {
	return source.replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

function diagnosticCodes(compiled: Awaited<ReturnType<typeof compileFamily>>): string[] {
	return [
		...compiled.semanticGraph.diagnostics.map((diagnostic) => diagnostic.code),
		...compiled.symbolModules.diagnostics.map((diagnostic) => diagnostic.code),
	];
}

test('the fixture the defect needs still differs from the bound family by one line', () => {
	expect(UNBOUND_FAMILY_SOURCE).not.toBe(BOUND_FAMILY_SOURCE);
	expect(UNBOUND_FAMILY_SOURCE).toContain('box.onChange?.(next);');
	expect(UNBOUND_FAMILY_SOURCE).not.toContain('box.onChange = onChange;');
});

// The defect: capture analysis mints a slot only for a slot some component fills,
// so the unfilled one reached the printer as the text the author wrote — a name
// that lives in the shared() factory and in no handler module.
test('a dispatch through an unfilled slot never emits the factory-local receiver', async () => {
	const family = await compileFamily(UNBOUND_FAMILY_SOURCE);
	const handler = handlerModuleSource(family);

	expect(handler).not.toContain('box.onChange');
	expect(codeOutsideStrings(handler)).not.toMatch(/\bbox\b/);
});

// The call folds the way `f?.(...)` already folds when nothing answers `f`, which
// is what a filled slot does when the consumer passes no prop.
test('the unfilled dispatch folds to undefined', async () => {
	const handler = handlerModuleSource(await compileFamily(UNBOUND_FAMILY_SOURCE));

	expect(handler).toContain('undefined;');
	expect(handler).not.toContain('context.capture.invoke');
});

// The silent-abort half: the dispatch was the last statement of an inlined
// method, so emitting it raw threw before anything after it and took the state
// write with it at runtime. The write must survive the fold.
test('the rest of the inlined method still lowers around the folded dispatch', async () => {
	const handler = handlerModuleSource(await compileFamily(UNBOUND_FAMILY_SOURCE));

	expect(handler).toContain(
		'context.graph.write({ graphNodeId: "shared:src/box.tsrx#boxState/state:box", path: ["checked"]',
	);
	expect(handler).toContain(
		'context.graph.read("shared:src/box.tsrx#boxState/state:box", ["checked"])',
	);
});

// The emitted module is now clean, so the read-back audit has nothing to report:
// the warning is the only thing that names the dead slot, and it still does.
test('the module reads back clean and the unbound slot is still reported', async () => {
	const family = await compileFamily(UNBOUND_FAMILY_SOURCE);

	expect(diagnosticCodes(family)).toContain('MARKLESS_CALLBACK_SLOT_UNBOUND');
	expect(diagnosticCodes(family)).not.toContain(SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE);
	expect(family.symbolModules.diagnostics).toEqual([]);
});

// Before the fold the audit caught this module, at severity error: the factory's
// slot receiver is also its own state() binding, so the surviving name was a name
// the audit knows. The fold removes the name rather than gating it.
test('the audit still errors on a factory-local name the compiler leaves unlowered', async () => {
	const family = await compileFamily(
		UNBOUND_FAMILY_SOURCE.replace(
			'box.checked = next;\n\t\t\t\tbox.onChange?.(next);',
			'box.checked = next;\n\t\t\t\tbox.missing.deeply.nested(next);',
		),
	);

	const unresolved = family.symbolModules.diagnostics.filter(
		(diagnostic) => diagnostic.code === SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE,
	);
	expect(unresolved.length).toBeGreaterThan(0);
	expect(unresolved[0]?.severity).toBe('error');
});

// The fold is keyed on the slot being unfilled, so a filled slot is untouched:
// it still routes through the capture context every family's callbacks ride.
test('a filled slot still lowers into its routed invoke', async () => {
	const family = await compileFamily(BOUND_FAMILY_SOURCE);
	const handler = handlerModuleSource(family);

	expect(handler).toContain('context.capture.invoke');
	expect(handler).not.toMatch(/\bbox\.onChange\b/);
	expect(diagnosticCodes(family)).not.toContain('MARKLESS_CALLBACK_SLOT_UNBOUND');
	expect(diagnosticCodes(family)).not.toContain(SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE);
});

// Two slots on one definition, one filled and one not: the fold selects per slot,
// not per definition.
test('one filled and one unfilled slot on the same definition are lowered separately', async () => {
	const family = await compileFamily(
		BOUND_FAMILY_SOURCE.replace(
			'\t\t\tonChange: undefined as ((next: boolean) => void) | undefined,',
			'\t\t\tonChange: undefined as ((next: boolean) => void) | undefined,\n\t\t\tonSettle: undefined as ((next: boolean) => void) | undefined,',
		).replace('\t\t\t\tbox.onChange?.(next);', '\t\t\t\tbox.onChange?.(next);\n\t\t\t\tbox.onSettle?.(next);'),
	);
	const handler = handlerModuleSource(family);

	expect(handler).toContain('context.capture.invoke');
	expect(handler).not.toMatch(/\bbox\.onSettle\b/);
	expect(codeOutsideStrings(handler)).not.toMatch(/\bbox\b/);
	expect(diagnosticCodes(family)).toContain('MARKLESS_CALLBACK_SLOT_UNBOUND');
	expect(diagnosticCodes(family)).not.toContain(SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE);
});
