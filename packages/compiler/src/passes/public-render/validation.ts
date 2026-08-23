import { analyze, isEventAttribute } from 'yuku-tsrx';
import { asNodes, childNodes, getIdentifierName, walkNode, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import {
	getComponentFunction,
	getDynamicTagExpression,
	getElementAttributes,
	getElementTagName,
	isIgnorableStaticTextNode as isIgnorableTextNode,
	isPlainHostTemplateNode,
	isSpreadAttribute,
	unwrapExpressionContainer,
} from '../../ast/tsrx.ts';
import {
	childrenOpacityDiagnostic,
	conditionalComponentRootDiagnostic,
	elementGuardReturnUnsupportedDiagnostic,
	noRenderableRootDiagnostic,
	repeatBindingNameConflictDiagnostic,
	undeclaredTemplateReadDiagnostic,
	unsupportedRenderBodyDiagnostic,
	unsupportedRenderConstructDiagnostic,
	unsupportedRenderRootDiagnostic,
} from './diagnostics.ts';
import type { PublicRenderPlanArtifact } from '../../artifacts.ts';
import {
	firstComponentRoot,
	describeUnsupportedFragmentContent,
	supportedFragmentRoot,
} from './template.ts';

export function emptyPlan(
	diagnostics: ReadonlyArray<PublicRenderPlanArtifact['diagnostics'][number]> = [],
): PublicRenderPlanArtifact {
	return {
		passId: 'public-render-plan',
		styleScopes: [],
		diagnostics,
	};
}

// Same-module helper components render through emission contexts that plan no
// boundary anchors: an @try inside one drops its content from the html and
// its in-arm records never register. Until that emission plans boundaries
// (arm-commit runtime work), the drop must be loud (D2), in the author's
// words (D4).
export function sameModuleChildBoundaryDiagnostics(
	ast: AnyNode,
	rootComponentName: string,
	filename: string,
) {
	const diagnostics: ReturnType<typeof unsupportedRenderConstructDiagnostic>[] = [];
	for (const statement of asNodes(ast.body)) {
		const component = getComponentFunction(statement);
		if (!component || component.name === rootComponentName) continue;
		const boundary = firstBoundaryNode(component.node);
		if (!boundary) continue;
		diagnostics.push(
			unsupportedRenderConstructDiagnostic({
				label: '@try/@pending/@catch',
				message: `<${component.name}> contains an @try block, but <${component.name}> is a helper component in the same file as the page. Its @try/@pending/@catch content is dropped from the rendered HTML.`,
				node: boundary,
				filename,
				suggestion: `Move <${component.name}> into its own .tsrx file and import it, or move the @try block into the page component.`,
				severity: 'error',
			}),
		);
	}
	return diagnostics;
}

function firstBoundaryNode(node: AnyNode): AnyNode | null {
	if (node.type === 'JSXTryExpression') return node;
	for (const child of childNodes(node)) {
		const found = firstBoundaryNode(child);
		if (found) return found;
	}
	return null;
}

// Constructs the module emitter cannot render yet must fail loud here; their
// content would otherwise silently disappear from CSR/SSR HTML.
// Children are an opaque compiler-owned template projection (spec
// 01-tsrx-host-contract): React-style inspection — mapping, counting,
// indexing, cloning, or mutating `children` — must diagnose loudly instead
// of silently misbehaving. Plain `{children}` placement stays supported.
export function collectChildrenOpacityDiagnostics(ast: AnyNode, filename: string) {
	const diagnostics: ReturnType<typeof childrenOpacityDiagnostic>[] = [];
	for (const statement of asNodes(ast.body)) {
		const component = getComponentFunction(statement);
		if (!component || !componentDeclaresChildren(component.node)) continue;
		const visit = (node: AnyNode): void => {
			if (
				node.type === 'MemberExpression' &&
				getIdentifierName(node.object as AnyNode | undefined) === 'children'
			) {
				diagnostics.push(childrenOpacityDiagnostic({ node, filename }));
				return;
			}
			for (const child of childNodes(node)) visit(child);
		};
		visit(component.node);
	}
	return diagnostics;
}

function componentDeclaresChildren(componentNode: AnyNode): boolean {
	for (const param of asNodes(componentNode.params)) {
		if (param.type !== 'ObjectPattern') continue;
		for (const property of asNodes(param.properties)) {
			const key = (property as { key?: AnyNode }).key;
			if (getIdentifierName(key) === 'children') return true;
		}
	}
	return false;
}

export function collectUnsupportedConstructDiagnostics(root: AnyNode, filename: string) {
	const diagnostics: ReturnType<typeof unsupportedRenderConstructDiagnostic>[] = [];

	const visit = (node: AnyNode): void => {
		if (
			(node.type === 'Element' || node.type === 'JSXElement') &&
			!getElementTagName(node) &&
			node.isDynamic !== true &&
			!getDynamicTagExpression(node)
		) {
			// Bare member-expression element names (<ui.Row />): method/namespace
			// component references need same-module child component support, which
			// does not exist yet. Recorded host decision: kept out, fail loud.
			diagnostics.push(
				unsupportedRenderConstructDiagnostic({
					label: 'member-expression component',
					message:
						'Member-expression component references render nothing because same-module child components are not supported yet.',
					node,
					filename,
					suggestion:
						'Move the component to its own module and import it, or use a plain top-level component name.',
				}),
			);
		} else if (
			node.type === 'JSXForExpression' &&
			node.empty &&
			!asNodes((node.empty as AnyNode).body).every(
				(child) => isIgnorableTextNode(child) || isPlainHostTemplateNode(child),
			)
		) {
			diagnostics.push(
				unsupportedRenderConstructDiagnostic({
					label: '@empty',
					message:
						'@empty content with components or control flow is dropped from rendered HTML; only host elements, text, and expressions render in the empty branch.',
					node: node.empty as AnyNode,
					filename,
					suggestion:
						'Keep the @empty branch to host elements, text, and expressions, or wrap the list in @if for richer empty states.',
				}),
			);
		}

		for (const child of childNodes(node)) visit(child);
	};

	visit(root);
	return diagnostics;
}

// findComponent only accepts components that already have an element root, so
// fragment-rooted and return-form components would silently plan nothing.
// This scan exists purely to explain those shapes; plain helper functions in a
// .tsrx module (no template content) stay diagnostic-free.
export function componentRootDiagnostics(ast: AnyNode, filename: string) {
	for (const statement of asNodes(ast.body)) {
		const componentFunction = getComponentFunction(statement);
		const body = componentFunction?.node.body as AnyNode | undefined;
		if (!body) continue;

		// Direct fragments and `return <>...</>` both need the multi-root
		// story; single-element returns are supported by firstComponentRoot.
		const fragment = childNodes(body).find(
			(child) =>
				child.type === 'Fragment' ||
				child.type === 'JSXFragment' ||
				(child.type === 'ReturnStatement' &&
					['Fragment', 'JSXFragment'].includes(
						(child.argument as AnyNode | undefined)?.type ?? '',
					)),
		);
		if (fragment) {
			const fragmentNode =
				fragment.type === 'ReturnStatement'
					? ((fragment.argument as AnyNode | undefined) ?? fragment)
					: fragment;
			if (supportedFragmentRoot(fragmentNode)) continue;
			const offender = describeUnsupportedFragmentContent(fragmentNode);
			return [
				unsupportedRenderRootDiagnostic({
					message: offender
						? `This component's root is a fragment (<>...</>). For now, a fragment root can only render static HTML: plain elements like <div>, text, and {expression} values, plus @if/@for/@switch/@try blocks as direct children. This fragment contains ${offender}, which needs a single root element to render.`
						: `This component's root is an empty fragment (<>...</>), so there is nothing to render.`,
					node: fragmentNode,
					filename,
					suggestion: offender
						? 'Wrap the template in a single root element such as <div> or <section> — components and dynamic content work normally once the component has one root element.'
						: 'Add content to the fragment, or give the component a single root element such as <div>.',
				}),
			];
		}
	}

	return [noRenderableRootDiagnostic({ node: ast, filename })];
}

export function componentConditionalRootDiagnostics(ast: AnyNode, filename: string) {
	for (const statement of asNodes(ast.body)) {
		const componentFunction = getComponentFunction(statement);
		const body = componentFunction?.node.body as AnyNode | undefined;
		if (!componentFunction || !body) continue;

		const returns = templateReturnStatements(body);
		if (returns.length > 1)
			return [
				conditionalComponentRootDiagnostic({
					node: returns[1]!,
					filename,
					componentName: componentFunction.name,
				}),
			];
		const root = firstComponentRoot(componentFunction.node);
		const guardReturn = root
			? componentReturnStatements(body).find((statement) => {
					const argument = returnArgument(statement);
					return argument !== root && !isEmptyGuardReturnArgument(argument);
				})
			: undefined;
		if (guardReturn) {
			return [
				elementGuardReturnUnsupportedDiagnostic({
					node: guardReturn,
					filename,
					componentName: componentFunction.name,
				}),
			];
		}
	}
	return [];
}

export function componentUnsupportedBodyDiagnostics(
	ast: AnyNode,
	filename: string,
	source: string,
) {
	for (const statement of asNodes(ast.body)) {
		const componentFunction = getComponentFunction(statement);
		const body = componentFunction?.node.body as AnyNode | undefined;
		if (!componentFunction || !body) continue;
		const root = firstComponentRoot(componentFunction.node);

		for (const bodyStatement of childNodes(body)) {
			if (isIgnorableTextNode(bodyStatement)) continue;
			if (bodyStatement === root || returnArgument(bodyStatement) === root) continue;
			const message = unsupportedBodyStatementMessage(bodyStatement, source);
			if (!message) continue;
			return [
				unsupportedRenderBodyDiagnostic({
					node: bodyStatement,
					filename,
					message,
					suggestion:
						'Split framework declarations into their own statements so the render module can preserve body order.',
				}),
			];
		}
	}
	return [];
}

/**
 * Refuses the one @for naming clash the emitters cannot serve: a name that is
 * one loop's item and another loop's index.
 *
 * Two loops both calling their item `row` are fine - every row reader binds the
 * name off the same row context, so one declaration answers both. Item-versus
 * -index is different: the two loops want the same name bound to different
 * context fields in a scope that has room for one binding. Refuse it here, where
 * both loops still have spans, rather than emitting a module that cannot parse.
 */
export function collectRepeatBindingConflictDiagnostics(input: {
	readonly root: AnyNode;
	readonly filename: string;
}) {
	const asItem = new Set<string>();
	const asIndex = new Set<string>();
	const conflicts: Array<{ readonly name: string; readonly node: AnyNode }> = [];
	walkNode(input.root, (node) => {
		// Only `@for` heads: a plain JS for-of in module code declares no index and
		// contributes no row binding to the emitted readers.
		if (node.type !== 'JSXForExpression') return;
		const statement = node.statement as AnyNode | undefined;
		if (!statement) return;
		const itemName = getIdentifierName(
			asNodes((statement.left as AnyNode | undefined)?.declarations)[0]?.id as
				| AnyNode
				| undefined,
		);
		const indexName = getIdentifierName(statement.index as AnyNode | undefined);
		if (itemName) {
			if (asIndex.has(itemName)) conflicts.push({ name: itemName, node });
			asItem.add(itemName);
		}
		if (indexName) {
			if (asItem.has(indexName)) conflicts.push({ name: indexName, node });
			asIndex.add(indexName);
		}
	});
	return conflicts.map((conflict) =>
		repeatBindingNameConflictDiagnostic({
			name: conflict.name,
			node: conflict.node,
			filename: input.filename,
		}),
	);
}

export function collectUndeclaredTemplateReadDiagnostics(input: {
	readonly ast: AnyNode;
	readonly component: AnyNode;
	readonly filename: string;
	readonly moduleImports: ReadonlyArray<string>;
	readonly repeatLocals: ReadonlyArray<string>;
	readonly root: AnyNode;
	readonly source: string;
}) {
	// Which names in a template read are not declared anywhere is a resolution
	// question, and the semantic view already answers it: every identifier use
	// it could not bind is a row with no symbol. Analyze the module once here —
	// this pass runs outside WalkState, and re-analyzing per read span would pay
	// the second parse over and over.
	const unresolved = unresolvedValueReferences(input.source, input.filename);
	if (unresolved.length === 0) return [];
	// Render policy rather than scope mechanics: these names are in scope when
	// the render module runs without any declaration the analyzer can see.
	const inRenderScope = new Set([...knownRenderGlobals, ...input.repeatLocals]);
	for (const read of emittedTemplateReads(input.root, input.source)) {
		const found = unresolved.find(
			(reference) =>
				reference.start >= read.start &&
				reference.end <= read.end &&
				!inRenderScope.has(reference.name),
		);
		if (!found) continue;
		return [
			undeclaredTemplateReadDiagnostic({
				name: found.name,
				node: read.node,
				filename: input.filename,
			}),
		];
	}
	return [];
}

/**
 * Identifier uses the analyzer could not resolve to a binding, in source order.
 *
 * Type-position names are left out: annotations are erased before the render
 * module runs, so an unresolved one cannot produce the ReferenceError this
 * diagnostic reports.
 */
function unresolvedValueReferences(
	source: string,
	filename: string,
): Array<{ readonly name: string; readonly start: number; readonly end: number }> {
	const view = analyze(source, filename).semantic;
	const references: Array<{ readonly name: string; readonly start: number; readonly end: number }> =
		[];
	for (let id = 0; id < view.reference.count; id++) {
		if (view.reference.symbolId(id) !== null) continue;
		if (view.reference.inTypePosition(id)) continue;
		references.push({
			name: view.reference.name(id),
			start: view.reference.start(id),
			end: view.reference.end(id),
		});
	}
	return references.sort((left, right) => left.start - right.start);
}

function emittedTemplateReads(
	root: AnyNode,
	fileSource: string,
): Array<{ readonly start: number; readonly end: number; readonly node: AnyNode }> {
	const reads: Array<{ readonly start: number; readonly end: number; readonly node: AnyNode }> = [];
	const add = (node: AnyNode | undefined) => {
		if (!node) return;
		// A read whose authored source cannot be recovered is not emitted, so it
		// is not a read this diagnostic can speak about.
		if (!expressionSource(node, fileSource)) return;
		reads.push({ start: node.start ?? 0, end: node.end ?? 0, node });
	};
	const visitTemplate = (node: AnyNode | null | undefined): void => {
		if (!node || typeof node !== 'object') return;
		if (node.type === 'JSXExpressionContainer' || node.type === 'TSRXExpression') {
			add(node.expression as AnyNode | undefined);
			return;
		}
		if (node.type === 'JSXIfExpression') add(node.test as AnyNode | undefined);
		if (node.type === 'JSXSwitchExpression') {
			add(node.discriminant as AnyNode | undefined);
			for (const switchCase of asNodes(node.cases))
				add(switchCase.test as AnyNode | undefined);
		}
		if (node.type === 'JSXForExpression') {
			add(node.collection as AnyNode | undefined);
			add(node.key as AnyNode | undefined);
		}
		add(getDynamicTagExpression(node) ?? undefined);
		for (const attribute of getElementAttributes(node)) {
			const attributeName = getIdentifierName(attribute.name as AnyNode | undefined) ?? '';
			if (
				isEventAttribute(attributeName) ||
				attributeName === 'attach' ||
				attributeName === 'el' ||
				attributeName === 'overlay'
			)
				continue;
			add(
				isSpreadAttribute(attribute)
					? (attribute.argument as AnyNode | undefined)
					: unwrapExpressionContainer(attribute.value as AnyNode | undefined),
			);
		}
		for (const child of childNodes(node)) visitTemplate(child);
	};
	visitTemplate(root);
	return reads;
}

const knownRenderGlobals = new Set(
	'Array Boolean Date Infinity Intl JSON Map Math NaN Number Object RegExp Set String false null true URL URLSearchParams undefined'.split(
		' ',
	),
);

function unsupportedBodyStatementMessage(statement: AnyNode, source: string): string | null {
	const declarations =
		statement.type === 'VariableDeclaration' ? asNodes(statement.declarations) : [];
	const frameworkDeclarations = declarations.filter((declaration) =>
		loweredFrameworkCalls.has(frameworkCallName(declaration.init as AnyNode | undefined)),
	);
	if (frameworkDeclarations.length > 0 && declarations.length !== 1) {
		const names = frameworkDeclarations
			.map((declaration) => getIdentifierName(declaration.id as AnyNode | undefined))
			.filter((name): name is string => !!name);
		const label = names.length > 0 ? names.join(', ') : expressionSource(statement, source);
		return `Cannot emit ${JSON.stringify(label)} because it mixes a framework declaration with other declarations.`;
	}
	return expressionSource(statement, source)
		? null
		: 'Cannot emit this component body statement because the compiler cannot recover its authored source.';
}

const loweredFrameworkCalls = new Set(['state', 'computed', 'element', 'handler']);

function frameworkCallName(node: AnyNode | null | undefined): string {
	return node?.type === 'CallExpression'
		? (getIdentifierName(node.callee as AnyNode | undefined) ?? '')
		: '';
}

function returnArgument(statement: AnyNode): AnyNode | undefined {
	return statement.type === 'ReturnStatement'
		? (statement.argument as AnyNode | undefined)
		: undefined;
}

function templateReturnStatements(node: AnyNode): AnyNode[] {
	const returns: AnyNode[] = [];
	const visit = (child: AnyNode | null | undefined): void => {
		if (!child || typeof child !== 'object') return;
		if (isFunctionNode(child) && child !== node) return;
		if (
			child.type === 'ReturnStatement' &&
			isTemplateRoot(child.argument as AnyNode | undefined)
		) {
			returns.push(child);
			return;
		}
		for (const grandchild of childNodes(child)) visit(grandchild);
	};
	for (const child of childNodes(node)) visit(child);
	return returns;
}

function componentReturnStatements(node: AnyNode): AnyNode[] {
	const returns: AnyNode[] = [];
	const visit = (child: AnyNode | null | undefined): void => {
		if (!child || typeof child !== 'object') return;
		if (isFunctionNode(child) && child !== node) return;
		if (child.type === 'ReturnStatement') {
			returns.push(child);
			return;
		}
		for (const grandchild of childNodes(child)) visit(grandchild);
	};
	for (const child of childNodes(node)) visit(child);
	return returns;
}

function isEmptyGuardReturnArgument(node: AnyNode | undefined): boolean {
	return (
		!node ||
		(node.type === 'Literal' && node.value === null) ||
		node.type === 'NullLiteral' ||
		(node.type === 'Identifier' && node.name === 'undefined')
	);
}

function isFunctionNode(node: AnyNode): boolean {
	return (
		node.type === 'FunctionDeclaration' ||
		node.type === 'FunctionExpression' ||
		node.type === 'ArrowFunctionExpression'
	);
}

function isTemplateRoot(node: AnyNode | null | undefined): boolean {
	return (
		node?.type === 'Element' ||
		node?.type === 'JSXElement' ||
		node?.type === 'Fragment' ||
		node?.type === 'JSXFragment' ||
		node?.type === 'JSXIfExpression'
	);
}
