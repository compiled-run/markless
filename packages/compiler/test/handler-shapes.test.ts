import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

async function errorsOf(source: string) {
	const result = await compileTsrxModule({ filename: 'src/page.tsrx', symbols: [], source });
	return [
		...result.semanticGraph.diagnostics,
		...result.captureAnalysis.diagnostics,
		...result.publicRenderPlan.diagnostics,
		...result.publicRenderModule.diagnostics,
		...result.symbolModules.diagnostics,
	].filter((diagnostic) => diagnostic.severity === 'error');
}

const children = {
	destructured: {
		declarations: `function Button({ onClick, children }: { onClick: () => void; children?: unknown }) @{
	<button onClick={onClick}>{children}</button>
}`,
		tag: 'Button',
	},
	propsMember: {
		declarations: `function Button(props: { onClick: () => void; children?: unknown }) @{
	<button onClick={props.onClick}>{props.children}</button>
}`,
		tag: 'Button',
	},
	propsCall: {
		declarations: `function Button(props: { onClick: () => void; children?: unknown }) @{
	<button onClick={() => props.onClick()}>{props.children}</button>
}`,
		tag: 'Button',
	},
	propsOptionalCall: {
		declarations: `function Button(props: { onClick?: () => void; children?: unknown }) @{
	<button onClick={() => props.onClick?.()}>{props.children}</button>
}`,
		tag: 'Button',
	},
	propsSpread: {
		declarations: `function Button(props: { onClick: () => void; children?: unknown }) @{
	<button {...props} />
}`,
		tag: 'Button',
	},
	propsMemberTwoWrappers: {
		declarations: `function Button(props: { onClick: () => void; children?: unknown }) @{
	<button onClick={props.onClick}>{props.children}</button>
}
function Toolbar(props: { onClick: () => void; children?: unknown }) @{
	<div><Button onClick={props.onClick}>{props.children}</Button></div>
}`,
		tag: 'Toolbar',
	},
	host: { declarations: '', tag: 'button' },
};

const add = `() => { drafts = [...drafts, text]; text = ''; }`;
const routable = {
	inline: { module: '', body: '', value: add },
	named: { module: '', body: `const add = ${add};`, value: 'add' },
	alias: { module: '', body: `const add = ${add};\n\tconst handler = add;`, value: 'handler' },
	aliasChain: {
		module: '',
		body: `function add() { drafts = [...drafts, text]; text = ''; }\n\tconst first = add;\n\tconst handler = first;`,
		value: 'handler',
	},
	factory: {
		module: '',
		body: `const makeAdd = (suffix: string) => () => { drafts = [...drafts, text + suffix]; text = ''; };\n\tconst handler = makeAdd('!');`,
		value: 'handler',
	},
	factoryFunction: {
		module: '',
		body: `function makeAdd(suffix: string) { return (event?: Event) => { drafts = [...drafts, text + suffix + (event ? '' : '?')]; text = ''; }; }\n\tconst handler = makeAdd('!');`,
		value: 'handler',
	},
	moduleFactory: {
		module: `const tagged = (suffix: string) => (value: string) => value + suffix;`,
		body: `const label = tagged('!');\n\tconst makeAdd = (format: (value: string) => string) => () => { drafts = [...drafts, format(text)]; text = ''; };\n\tconst handler = makeAdd(label);`,
		value: 'handler',
	},
};

const unroutable = {
	reassignedLet: {
		module: '',
		body: `let handler = () => { drafts = [...drafts, text]; };\n\thandler = () => { text = ''; };`,
		value: 'handler',
		why: 'reassigns',
		rewrite: 'onClick={(event) => (condition ? first(event) : second(event))}',
	},
	importedFactory: {
		module: `import { makeAdd } from './factories.ts';`,
		body: `const handler = makeAdd(text);`,
		value: 'handler',
		why: 'not declared in this file',
		rewrite: 'const handler = (event) => {',
	},
	workingFactory: {
		module: '',
		body: `const makeAdd = (suffix: string) => { let count = 0; return () => { count += 1; drafts = [...drafts, text + suffix + count]; }; };\n\tconst handler = makeAdd('!');`,
		value: 'handler',
		why: 'does more than return a function',
		rewrite: 'state()',
	},
	cancelingFactory: {
		module: '',
		body: `const makeAdd = (suffix: string) => (event: Event) => { event.preventDefault(); drafts = [...drafts, text + suffix]; };\n\tconst handler = makeAdd('!');`,
		value: 'handler',
		why: 'cancels the event',
		rewrite: 'event.preventDefault()',
	},
};

function page(
	child: (typeof children)[keyof typeof children],
	handler: { readonly module: string; readonly body: string; readonly value: string },
) {
	return `import { state } from '@markless/core';
${handler.module}

${child.declarations}

export default function Page() @{
	let drafts = state<string[]>([]);
	let text = state('');
	${handler.body}
	<main>
		<input value={text} onInput={(event) => (text = event.currentTarget.value)} />
		<${child.tag} onClick={${handler.value}}>Add</${child.tag}>
		<p>{drafts.length}</p>
	</main>
}
`;
}

for (const [childName, child] of Object.entries(children)) {
	for (const [handlerName, handler] of Object.entries(routable))
		test(`a ${handlerName} handler into a ${childName} child compiles`, async () => {
			expect((await errorsOf(page(child, handler))).map((error) => error.message)).toEqual(
				[],
			);
		});

	for (const [handlerName, handler] of Object.entries(unroutable))
		test(`a ${handlerName} handler into a ${childName} child fails saying why and how to rewrite it`, async () => {
			const errors = await errorsOf(page(child, handler));
			expect(errors.length).toBeGreaterThan(0);
			for (const error of errors) {
				expect(error.why).toContain(handler.why);
				expect(
					error.suggestions?.map((suggestion) => suggestion.message).join('\n'),
				).toContain(handler.rewrite);
			}
		});
}

test('a factory handler runs the call the factory returns, rebuilt each time the event runs', async () => {
	const result = await compileTsrxModule({
		filename: 'src/page.tsrx',
		symbols: [],
		source: page(children.host, routable.factory),
	});
	const handler = result.semanticGraph.events.find((event) => event.eventName === 'click');
	expect(handler?.handlerSource).toMatch(/^\(\) => \(/);
	expect(handler?.handlerSource).toContain('(suffix: string) => () => {');
	expect(handler?.handlerSource).toMatch(/\('!'\)\)+\(\)$/);
});
