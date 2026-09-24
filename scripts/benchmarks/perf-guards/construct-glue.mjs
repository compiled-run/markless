import { transformTsrxModule } from '../../../packages/bundler/src/transform.ts';

// One shared state and button; each construct instance reads it, so only the construct itself repeats.
const CONSTRUCTS = {
	'event handler': {
		declare: () => '',
		markup: (i) => `<button type="button" onClick={() => v = v + ${i + 1}}>add ${i}</button>`,
	},
	'text binding': {
		declare: () => '',
		markup: (i) => `<span>{v + ${i + 1}}</span>`,
	},
	'@if': {
		declare: () => '',
		markup: (i) => `@if (v > ${i}) { <em>on ${i}</em> }`,
	},
	'keyed @for': {
		declare: (i) => `const rows${i} = computed(() => [{ id: v, label: 'row ${i}' }]);`,
		markup: (i) => `<ul>@for (const r of rows${i}; key r.id) { <li>{r.label}</li> }</ul>`,
	},
	'async boundary': {
		declare: (i) => `const data${i} = computed(async () => ({ name: 'n' + v }));`,
		markup: (i) =>
			`@try { <p>{data${i}.name}</p> } @pending { <p>loading ${i}</p> } @catch { <p>failed ${i}</p> }`,
	},
};

export const CONSTRUCT_NAMES = Object.keys(CONSTRUCTS);

function fixtureSource(construct, count) {
	const { declare, markup } = CONSTRUCTS[construct];
	const indexes = [...Array(count).keys()];
	return `import { computed, state } from '@markless/core';

export default function App() @{
	let v = state(0);
	${indexes.map(declare).join('\n\t')}
	<main>
		<button type="button" onClick={() => v = v + 1}>next</button>
		<output>{v}</output>
		${indexes.map(markup).join('\n\t\t')}
	</main>
}
`;
}

/** Every byte the compiler hands the bundler for the browser: the module and all its generated modules. */
async function emittedClientBytes(source) {
	const result = await transformTsrxModule({
		filename: '/construct-glue/src/App.tsrx',
		source,
		environment: 'client',
	});
	const encoder = new TextEncoder();
	return [result.code, ...result.virtualModules.map((module) => module.source)].reduce(
		(total, code) => total + encoder.encode(code ?? '').length,
		0,
	);
}

/** Marginal emitted glue per construct: (bytes with 3 instances - bytes with 1) / 2, author text held constant. */
export async function measureConstructGlue(names = CONSTRUCT_NAMES) {
	const out = {};
	for (const name of names) {
		const one = await emittedClientBytes(fixtureSource(name, 1));
		const three = await emittedClientBytes(fixtureSource(name, 3));
		out[name] = { bytesPerInstance: Math.round((three - one) / 2), oneInstance: one };
	}
	return out;
}
