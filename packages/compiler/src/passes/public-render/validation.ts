import { isEventAttribute, normalizeEventName, parseModule } from '@tsrx/core';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import {
	escapeAttribute,
	escapeHtml,
	getComponentFunction,
	getDynamicTagExpression,
	getElementAttributes,
	getElementTagName,
	isHostTagName,
	isIgnorableStaticTextNode as isIgnorableTextNode,
	isPlainHostTemplateNode,
	isSpreadAttribute,
	isStaticTextNode,
	staticTextValue,
	trimmedStaticTextValue,
	unwrapExpressionContainer,
} from '../../ast/tsrx.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
	splitStaticGraphPath,
} from '../../artifact-helpers/graph-paths.ts';
import {
	childrenOpacityDiagnostic,
	conditionalComponentRootDiagnostic,
	noRenderableRootDiagnostic,
	repeatRowStateScopeUnsupportedDiagnostic,
	undeclaredTemplateReadDiagnostic,
	unsupportedRenderBodyDiagnostic,
	unsupportedRenderConstructDiagnostic,
	unsupportedRenderRootDiagnostic,
} from './diagnostics.ts';
import { collectStyleScopes } from './style-scopes.ts';
import type {
	PayloadKeyedRepeat,
	PlannedSymbol,
	PublicRenderPlanArtifact,
	PublicRenderPlanAsyncBoundaryGate,
	PublicRenderPlanBranchArmPart,
	PublicRenderPlanBranchGate,
	PublicRenderPlanClassWrite,
	PublicRenderPlanEventControl,
	PublicRenderPlanInput,
	PublicRenderPlanKeyedRepeat,
	PublicRenderPlanRepeatGate,
	PublicRenderPlanStaticEventControl,
	PublicRenderPlanStaticTextWrite,
	PublicRenderPlanTextWrite,
	PublicRenderPlanUnsupportedReason,
	SemanticGraphBinding,
} from '../../artifacts.ts';
import type { BranchSiteNode } from './branch-planning.ts';
import { singleRowRoot, firstComponentRoot, supportedFragmentRoot, unsupportedFragmentChildKind } from './template.ts';

export function emptyPlan(
	diagnostics: ReadonlyArray<PublicRenderPlanArtifact['diagnostics'][number]> = [],
): PublicRenderPlanArtifact {
	return {
		passId: 'public-render-plan',
		rootTemplateHtml: null,
		directRenderTemplateHtml: null,
		staticHostNodeIds: [],
		staticHostLocators: [],
		staticEventControls: [],
		staticTextWrites: [],
		repeatGates: [],
		keyedRepeats: [],
		asyncBoundaryGates: [],
		branchReactivityGates: [],
		branchArms: [],
		asyncBoundaryArms: [],
		styleScopes: [],
		diagnostics,
	};
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

export function repeatRenderDiagnostics(input: {
	readonly componentEdgeCount: number;
	readonly filename: string;
	readonly keyedRepeats: ReadonlyArray<PublicRenderPlanKeyedRepeat>;
	readonly repeatGates: ReadonlyArray<PublicRenderPlanRepeatGate>;
	readonly repeatNodeById: ReadonlyMap<string, AnyNode>;
}) {
	return input.repeatGates.flatMap((gate) => {
		const node = input.repeatNodeById.get(gate.repeatId);
		if (!node) return [];
		if (!gate.supported) {
			const creation = repeatRowStateCreation(node);
			if (creation) {
				return [
					repeatRowStateScopeUnsupportedDiagnostic({
						...creation,
						filename: input.filename,
					}),
				];
			}
			return [
				unsupportedRenderConstructDiagnostic({
					label: '@for',
					message: `The @for rows are not compiler-proven (reason: ${gate.reason}), so the render module drops the list content.`,
					node,
					filename: input.filename,
					suggestion: repeatUnsupportedSuggestion(node, gate.reason),
				}),
			];
		}
		if (input.componentEdgeCount > 0) {
			return [
				unsupportedRenderConstructDiagnostic({
					label: '@for',
					message:
						'Keyed repeat rows are skipped in SSR output when the module renders component children, so the list content is dropped.',
					node,
					filename: input.filename,
					suggestion:
						'Keep the repeat in a component without child components until repeat rows compose with component children.',
				}),
			];
		}
		if (
			!gate.ssrOnly &&
			!input.keyedRepeats.some((repeat) => repeat.repeatId === gate.repeatId)
		) {
			return [
				unsupportedRenderConstructDiagnostic({
					label: '@for',
					message:
						'The @for rows could not be planned even though the repeat gate is supported, so the render module drops the list content.',
					node,
					filename: input.filename,
					suggestion:
						'Keep the repeat directly inside a host parent element with a single row root.',
				}),
			];
		}
		return [];
	});
}

function repeatRowStateCreation(
	node: AnyNode,
): { readonly apiName: 'state' | 'computed'; readonly name: string; readonly node: AnyNode } | null {
	for (const child of asNodes((node.body as AnyNode | undefined)?.body)) {
		if (isIgnorableTextNode(child)) continue;
		if (child.type !== 'VariableDeclaration') continue;
		for (const declaration of asNodes(child.declarations)) {
			const init = declaration.init as AnyNode | undefined;
			if (!init || init.type !== 'CallExpression') continue;
			const apiName = getIdentifierName(init.callee as AnyNode | undefined);
			if (apiName !== 'state' && apiName !== 'computed') continue;
			const name = getIdentifierName(declaration.id as AnyNode | undefined);
			if (!name) continue;
			return { apiName, name, node: init };
		}
	}
	return null;
}

function repeatUnsupportedSuggestion(
	node: AnyNode,
	reason: PublicRenderPlanUnsupportedReason,
): string {
	const row = singleRowRoot(node);
	const tagName = row ? getElementTagName(row) : null;
	if (reason === 'unsupported-row-binding' && tagName && !isHostTagName(tagName)) {
		return `Rows that render a component (<${tagName} />) are not supported by the render path yet; render host-element rows, or lift the component's markup into the row until component rows ship.`;
	}
	return 'Reshape the rows into a single host element with directly readable item bindings.';
}

export function branchRenderDiagnostics(input: {
	readonly branchGates: ReadonlyArray<PublicRenderPlanBranchGate>;
	readonly branchNodes: ReadonlyArray<BranchSiteNode>;
	readonly filename: string;
}) {
	return input.branchGates.flatMap((gate, index) => {
		const found = input.branchNodes[index];
		if (gate.supported || !found) return [];
		const label = found.node.type === 'JSXSwitchExpression' ? '@switch' : '@if';
		const componentName = firstComponentName(found.node);
		const componentDetail = componentName ? ` contain a component (<${componentName} />), and` : '';
		const suggestion = componentName
			? 'Move the condition inside the component, or put host elements in the arms until component arms are supported.'
			: 'Move the branch out of nested control flow, or keep branch arms to host elements, text, and graph-resolvable expressions.';
		return [
			unsupportedRenderConstructDiagnostic({
				label,
				message: `The arms of ${label}${componentDetail} are not compiler-proven (reason: ${gate.reason}), so the branch would render its initial content and never update.`,
				node: found.node,
				filename: input.filename,
				suggestion,
			}),
		];
	});
}

function firstComponentName(node: AnyNode): string | null {
	if (node.type === 'Element' || node.type === 'JSXElement') {
		const tagName = getElementTagName(node);
		if (tagName && !isHostTagName(tagName)) return tagName;
	}
	for (const child of childNodes(node)) {
		const found = firstComponentName(child);
		if (found) return found;
	}
	return null;
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
			return [
				unsupportedRenderRootDiagnostic({
					message: `Fragment roots render only when every top-level child is a plain host element; this fragment has a ${unsupportedFragmentChildKind(fragmentNode)}, which needs the dynamic fragment anchor work.`,
					node: fragmentNode,
					filename,
					suggestion:
						'Wrap the fragment children in a single host element such as <div> or <section>, or keep top-level children to plain host elements.',
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
		if (!body) continue;

		const returns = templateReturnStatements(body);
		if (returns.length > 1) return [conditionalComponentRootDiagnostic({
			node: returns[1]!, filename, componentName: componentFunction.name,
		})];
	}
	return [];
}

export function componentUnsupportedBodyDiagnostics(ast: AnyNode, filename: string, source: string) {
	for (const statement of asNodes(ast.body)) {
		const componentFunction = getComponentFunction(statement);
		const body = componentFunction?.node.body as AnyNode | undefined;
		if (!body) continue;
		const root = firstComponentRoot(componentFunction.node);

		for (const bodyStatement of childNodes(body)) {
			if (isIgnorableTextNode(bodyStatement)) continue;
			if (bodyStatement === root || returnArgument(bodyStatement) === root) continue;
			const message = unsupportedBodyStatementMessage(bodyStatement, source);
			if (!message) continue;
			return [unsupportedRenderBodyDiagnostic({
				node: bodyStatement, filename, message,
				suggestion: 'Split framework declarations into their own statements so the render module can preserve body order.',
			})];
		}
	}
	return [];
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
	const scope = new Set([...knownRenderGlobals, ...input.moduleImports, ...input.repeatLocals, ...declarations(asNodes(input.ast.body).filter((statement) => !getComponentFunction(statement))), ...componentPropNames(input.component), ...declarations(childNodes(input.component.body as AnyNode | undefined)), ...catchNames(input.root)]);
	for (const read of emittedTemplateReads(input.root, input.source)) {
		const name = [...identifiersFromSource(read.source)].find((identifier) => !scope.has(identifier));
		if (!name) continue;
		return [undeclaredTemplateReadDiagnostic({ name, node: read.node, filename: input.filename })];
	}
	return [];
}

function declarations(nodes: ReadonlyArray<AnyNode>): string[] {
	return nodes.flatMap((node) => {
		node = node.type === 'ExportNamedDeclaration' ? (node.declaration as AnyNode | undefined) ?? node : node;
		if (node.type === 'VariableDeclaration') return asNodes(node.declarations).flatMap((declaration) => bindingNames(declaration.id as AnyNode | undefined));
		if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') return bindingNames(node.id as AnyNode | undefined);
		return [];
	});
}

function bindingNames(node: AnyNode | undefined): string[] {
	if (node?.type === 'AssignmentPattern') return bindingNames(node.left as AnyNode | undefined);
	const name = getIdentifierName(node);
	return name ? [name] : [];
}

function catchNames(root: AnyNode): string[] {
	const names: string[] = [];
	const visit = (node: AnyNode | null | undefined): void => {
		if (!node || typeof node !== 'object') return;
		if (node.type === 'CatchClause') names.push(...bindingNames(node.param as AnyNode | undefined));
		for (const child of childNodes(node)) visit(child);
	};
	visit(root);
	return names;
}

function componentPropNames(component: AnyNode): string[] {
	const param = asNodes(component.params)[0];
	if (!param) return [];
	const name = getIdentifierName(param);
	if (name) return [name];
	return param.type === 'ObjectPattern'
		? asNodes(param.properties).flatMap((property) => {
				const prop = property as AnyNode;
				return bindingNames((prop.value as AnyNode | undefined) ?? (prop.key as AnyNode | undefined));
			})
		: [];
}

function emittedTemplateReads(root: AnyNode, fileSource: string): Array<{ readonly source: string; readonly node: AnyNode }> {
	const reads: Array<{ readonly source: string; readonly node: AnyNode }> = [];
	const add = (node: AnyNode | undefined) => {
		if (!node) return;
		const source = expressionSource(node, fileSource);
		if (source) reads.push({ source, node });
	};
	const visitTemplate = (node: AnyNode | null | undefined): void => {
		if (!node || typeof node !== 'object') return;
			if (node.type === 'JSXExpressionContainer' || node.type === 'TSRXExpression') { add(node.expression as AnyNode | undefined); return; }
			if (node.type === 'JSXIfExpression') add(node.test as AnyNode | undefined);
			if (node.type === 'JSXSwitchExpression') {
				add(node.discriminant as AnyNode | undefined);
				for (const switchCase of asNodes(node.cases)) add(switchCase.test as AnyNode | undefined);
			}
		if (node.type === 'JSXForExpression') {
			add(node.collection as AnyNode | undefined);
			add(node.key as AnyNode | undefined);
		}
		add(getDynamicTagExpression(node) ?? undefined);
		for (const attribute of getElementAttributes(node)) {
			const attributeName = getIdentifierName(attribute.name as AnyNode | undefined) ?? '';
			if (isEventAttribute(attributeName) || attributeName === 'attach' || attributeName === 'el') continue;
			add(isSpreadAttribute(attribute) ? attribute.argument as AnyNode | undefined : unwrapExpressionContainer(attribute.value as AnyNode | undefined));
		}
		for (const child of childNodes(node)) visitTemplate(child);
	};
	visitTemplate(root);
	return reads;
}

function identifiersFromSource(source: string): Set<string> {
	const stripped = source.replaceAll(/(['"`])(?:\\.|(?!\1)[\s\S])*\1/g, '');
	const names = new Set<string>();
	for (const match of stripped.matchAll(/\b[A-Za-z_$][\w$]*\b/g)) {
		const index = match.index ?? 0;
		const name = match[0]!;
		const before = stripped[index - 1];
		const after = stripped.slice(index + name.length).trimStart()[0];
		if (before === '.' || after === ':') continue;
		names.add(name);
	}
	return names;
}

const knownRenderGlobals = new Set('Array Boolean Date Infinity Intl JSON Map Math NaN Number Object RegExp Set String false null true URL URLSearchParams undefined'.split(' '));

function unsupportedBodyStatementMessage(statement: AnyNode, source: string): string | null {
	const declarations = statement.type === 'VariableDeclaration' ? asNodes(statement.declarations) : [];
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
	return node?.type === 'CallExpression' ? (getIdentifierName(node.callee as AnyNode | undefined) ?? '') : '';
}

function returnArgument(statement: AnyNode): AnyNode | undefined {
	return statement.type === 'ReturnStatement' ? (statement.argument as AnyNode | undefined) : undefined;
}

function templateReturnStatements(node: AnyNode): AnyNode[] {
	const returns: AnyNode[] = [];
	const visit = (child: AnyNode | null | undefined): void => {
		if (!child || typeof child !== 'object') return;
		if (isFunctionNode(child) && child !== node) return;
		if (child.type === 'ReturnStatement' && isTemplateRoot(child.argument as AnyNode | undefined)) {
			returns.push(child);
			return;
		}
		for (const grandchild of childNodes(child)) visit(grandchild);
	};
	for (const child of childNodes(node)) visit(child);
	return returns;
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
