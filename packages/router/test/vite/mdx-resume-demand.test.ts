import { parseSync } from 'rolldown/experimental';
import { expect, test, vi } from 'vitest';
import { transformMdxRoute } from '../../src/vite/mdx.ts';

type Input = { root: Record<string, unknown>; event: object; scalar?: boolean };
type RuntimeModule = { resumeFromPayloadDocument(input: unknown): unknown };

async function entry(source: string, load: (specifier: string) => Promise<RuntimeModule>) {
	const code = await transformMdxRoute(source, '/project/pages/example.mdx?markless-resume');
	const parsed = parseSync('route.js', code);
	expect(parsed.errors).toEqual([]);
	const executable = parsed.program.body
		.map((node) => {
			if (node.type === 'ImportDeclaration' || node.type === 'ExportDefaultDeclaration')
				return '';
			if (node.type === 'ExportNamedDeclaration' && node.declaration)
				return code.slice(node.declaration.start, node.declaration.end);
			return code.slice(node.start, node.end);
		})
		.join('\n')
		.replace(/\bimport\(/g, 'load(');
	return new Function(
		'tryResumeMdxScalar',
		'load',
		'globalThis',
		`${executable}; return resumeContainerEvent;`,
	)((input: Input) => input.scalar === true, load, {}) as (input: Input) => Promise<void>;
}

test.each([
	"import Meter from './Meter.tsrx';\n\n<Meter />",
	"import Branch from './Branch.tsrx';\n\n# Controls\n\n<Branch />\n\n<Branch />",
])('MDX loads fallback code once while dispatching each root independently: %s', async (source) => {
	const dispatch = vi.fn();
	const resumeFromPayloadDocument = vi
		.fn<(input: { root: object }) => { runtime: { dispatch: typeof dispatch } }>()
		.mockReturnValue({ runtime: { dispatch } });
	const load = vi.fn().mockResolvedValue({ resumeFromPayloadDocument });
	const resume = await entry(source, load);
	const first = {};
	const second = {};
	expect(load).not.toHaveBeenCalled();
	await resume({ root: first, event: {}, scalar: true });
	expect(load).not.toHaveBeenCalled();
	const inputs = [
		{ root: first, event: {} },
		{ root: second, event: {} },
	];
	await Promise.all(inputs.map(resume));
	await resume({ root: first, event: {} });
	expect(load).toHaveBeenCalledTimes(1);
	expect(resumeFromPayloadDocument.mock.calls.map(([input]) => input.root)).toEqual([
		first,
		second,
		first,
	]);
	expect(dispatch).toHaveBeenCalledTimes(3);
	expect(dispatch.mock.calls.slice(0, 2).map(([event]) => event)).toEqual(
		inputs.map((input) => input.event),
	);
});

test('MDX retries a rejected fallback import and retains it after a dispatch error', async () => {
	const importError = new Error('module unavailable');
	const dispatchError = new Error('handler failed');
	const dispatch = vi.fn().mockRejectedValueOnce(dispatchError).mockResolvedValue(undefined);
	const load = vi
		.fn()
		.mockRejectedValueOnce(importError)
		.mockResolvedValue({ resumeFromPayloadDocument: () => ({ runtime: { dispatch } }) });
	const resume = await entry("import Control from './Control.tsrx';\n\n<Control />", load);
	const root = {};
	await expect(resume({ root, event: {} })).rejects.toBe(importError);
	await expect(resume({ root, event: {} })).rejects.toBe(dispatchError);
	await resume({ root, event: {} });
	expect(load).toHaveBeenCalledTimes(2);
	expect(dispatch).toHaveBeenCalledTimes(2);
});
