import { expect, test, vi } from 'vitest';
import { parseSync } from 'rolldown/experimental';
import { protocolIslandSegment } from '../../../serializer/src/protocol-constants.ts';
import { transformMdxRoute } from '../../src/vite/mdx.ts';

type Module = {
	loadSymbol(id: string): unknown;
	loadScalarActionPlan?(id: string): { scope: string; id: string } | undefined;
};
type Loader = {
	prefix: string;
	loadSymbol(id: string): Promise<unknown>;
	loadScalarActionPlan(id: string): Promise<{ scope: string; id: string } | undefined>;
};

async function loaders(source: string, load: (specifier: string) => Promise<Module>) {
	const code = await transformMdxRoute(source, '/project/pages/example.mdx?markless-resume');
	const parsed = parseSync('route.js', code);
	expect(parsed.errors).toEqual([]);
	const expression = parsed.program.body
		.flatMap((node) => (node.type === 'VariableDeclaration' ? node.declarations : []))
		.find(
			(node) => node.id.type === 'Identifier' && node.id.name === 'marklessMdxSymbolLoaders',
		)?.init;
	if (!expression) throw new Error('No generated symbol loader table');
	return new Function(
		'load',
		'return ' + code.slice(expression.start, expression.end).replace(/\bimport\(/g, 'load('),
	)(load) as Loader[];
}

test.each([
	['Meter', './Meter.tsrx', 'step', 'c0:'],
	['Reading', './Reading.tsrx', 'advance', 'c4:'],
])(
	'generated %s loaders share module demand while keeping symbols lazy',
	async (name, file, symbol, scope) => {
		let resolve!: (module: Module) => void;
		const load = vi.fn(
			() =>
				new Promise<Module>((ready) => {
					resolve = ready;
				}),
		);
		const run = vi.fn((id: string) => id);
		const table = await loaders(
			`import ${name} from '${file}';\n\n<${name} />\n\n<${name} />`,
			load,
		);
		expect(load).not.toHaveBeenCalled();
		const first = table[0]!;
		const plan = first.loadScalarActionPlan(first.prefix + symbol);
		const handler = first.loadSymbol(first.prefix + symbol);
		expect(load).toHaveBeenCalledTimes(1);
		const mod: Module = { loadSymbol: run, loadScalarActionPlan: (id) => ({ scope, id }) };
		resolve(mod);
		expect(await plan).toEqual({ scope: protocolIslandSegment(0) + scope, id: symbol });
		expect(await handler).toBe(symbol);
		expect(run.mock.calls).toEqual([[symbol]]);
		expect(await first.loadSymbol(first.prefix + 'independent')).toBe('independent');
		expect(await first.loadSymbol(first.prefix + symbol)).toBe(symbol);
		expect(load).toHaveBeenCalledTimes(1);
		const second = table[1]!;
		const secondPlan = second.loadScalarActionPlan(second.prefix + symbol);
		resolve(mod);
		expect(await secondPlan).toEqual({ scope: protocolIslandSegment(1) + scope, id: symbol });
		expect(run.mock.calls).toEqual([[symbol], ['independent'], [symbol]]);
	},
);

test('a failed module request is shared in flight and a later request retries', async () => {
	const failure = new Error('unavailable');
	let reject!: (error: Error) => void;
	const load = vi
		.fn<(_: string) => Promise<Module>>()
		.mockImplementationOnce(
			() =>
				new Promise((_, fail) => {
					reject = fail;
				}),
		)
		.mockResolvedValue({ loadSymbol: (id) => id });
	const [loader] = await loaders("import Action from './Action.tsrx';\n\n<Action />", load);
	const first = loader!.loadSymbol(loader!.prefix + 'first');
	const second = loader!.loadSymbol(loader!.prefix + 'second');
	const settled = Promise.allSettled([first, second]);
	expect(load).toHaveBeenCalledTimes(1);
	reject(failure);
	expect(await settled).toEqual([
		{ status: 'rejected', reason: failure },
		{ status: 'rejected', reason: failure },
	]);
	expect(await loader!.loadSymbol(loader!.prefix + 'third')).toBe('third');
	expect(load).toHaveBeenCalledTimes(2);
	expect(await loader!.loadScalarActionPlan(loader!.prefix + 'missing')).toBeUndefined();
	expect(load).toHaveBeenCalledTimes(2);
});
