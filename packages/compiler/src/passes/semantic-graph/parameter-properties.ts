import { asNodes, getIdentifierName, walkNode, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import type { SemanticGraphDiagnostic } from '../../artifacts.ts';
import { typeStripParameterPropertyDiagnostic } from './diagnostics.ts';

export const TYPE_STRIP_PARAMETER_PROPERTY_CODE = 'MARKLESS_TYPE_STRIP_PARAMETER_PROPERTY';

/** `constructor(public x: number)` anywhere in the module: a field the type remover cannot keep. */
export function parameterPropertyDiagnostics(
	ast: AnyNode,
	source: string,
	filename: string,
): SemanticGraphDiagnostic[] {
	const diagnostics: SemanticGraphDiagnostic[] = [];
	walkNode(ast, (node) => {
		if (node.type !== 'ClassDeclaration' && node.type !== 'ClassExpression') return;
		const className = getIdentifierName(node.id as AnyNode | undefined);
		for (const member of asNodes((node.body as AnyNode | undefined)?.body)) {
			if (member.type !== 'MethodDefinition' || member.kind !== 'constructor') continue;
			for (const parameter of asNodes((member.value as AnyNode | undefined)?.params)) {
				if (parameter.type !== 'TSParameterProperty') continue;
				const declared = parameter.parameter as AnyNode | undefined;
				const target =
					declared?.type === 'AssignmentPattern' ? (declared.left as AnyNode) : declared;
				diagnostics.push(
					typeStripParameterPropertyDiagnostic({
						className: className ? `class ${className}` : 'this class',
						parameterName: getIdentifierName(target) ?? expressionSource(parameter, source),
						source: expressionSource(parameter, source),
						sourceSpan: sourceSpan(parameter, filename),
					}),
				);
			}
		}
	});
	return diagnostics;
}
