import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { expect, test, vi } from 'vitest';

test('instance-scoped symbol loading excludes arm materialization dependencies', async () => {
	const input = fileURLToPath(new URL('../src/fns/instance-scope.ts', import.meta.url));
	const build = await rolldown({ input, treeshake: false });
	try {
		const { output } = await build.generate({ format: 'es' });
		const chunks = output.filter((item) => item.type === 'chunk');
		expect(chunks.flatMap((chunk) => chunk.exports)).toContain(
			'marklessInstanceScopedLoadSymbol',
		);
		const modules = chunks.flatMap((chunk) => chunk.moduleIds);
		expect(modules.some((id) => id.endsWith('/resume-arm-records.ts'))).toBe(false);
		expect(modules.some((id) => id.endsWith('/inline/resume-errors.ts'))).toBe(false);
	} finally {
		await build.close();
	}
});

test('arm registration shares its state through the existing and lightweight imports', async () => {
	vi.resetModules();
	const light = await import('../src/resume-handle-qualifier.ts');
	const records = await import('../src/resume-arm-records.ts');
	expect(light.composedArmRecordQualifier()).toBeUndefined();
	expect(records.composedArmRecordQualifier()).toBeUndefined();
	const first: Parameters<typeof light.installComposedArmRecordQualifier>[0] = (_, set) => set;
	records.installComposedArmRecordQualifier(first);
	expect(light.composedArmRecordQualifier()).toBe(first);
	expect(records.composedArmRecordQualifier()).toBe(first);
	const second: typeof first = (_, set) => ({ ...set });
	light.installComposedArmRecordQualifier(second);
	expect(light.composedArmRecordQualifier()).toBe(second);
	expect(records.composedArmRecordQualifier()).toBe(second);
});

test.each([false, true])(
	'composed registration works with materialization loaded first=%s',
	async (first) => {
		vi.resetModules();
		if (first) await import('../src/resume-arm-records.ts');
		const { installMarklessComposedArmRecords } = await import('../src/fns/instance-scope.ts');
		installMarklessComposedArmRecords();
		const { composedArmRecordQualifier } = await import('../src/resume-arm-records.ts');
		expect(composedArmRecordQualifier()).toBeTypeOf('function');
		const set = { locators: [], events: [], domUpdates: [], behaviors: [], elementHandles: [] };
		expect(composedArmRecordQualifier()!('boundary', set)).toEqual(set);
	},
);
