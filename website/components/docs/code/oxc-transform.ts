// The two calls the bundler makes on rolldown/experimental, answered by yuku in the browser.
import { parseJavaScriptModule } from '../../../../packages/compiler/src/index.ts';
import { generate } from './yuku-codegen.ts';

type Diagnostic = { readonly message: string };

function parseTypeScript(code: string): { program: unknown; errors: Diagnostic[] } {
	try {
		return { program: parseJavaScriptModule(code, 'markless-emitted.ts'), errors: [] };
	} catch (error) {
		return {
			program: null,
			errors: [{ message: error instanceof Error ? error.message : String(error) }],
		};
	}
}

export function parseSync(_filename: string, code: string) {
	return parseTypeScript(code);
}

export function transformSync(_filename: string, code: string) {
	const { program, errors } = parseTypeScript(code);
	if (errors.length > 0) return { code: '', errors };
	return { code: generate(program, { strip: true }).code, errors: [] as Diagnostic[] };
}
