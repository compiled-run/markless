import { expect, test } from 'vitest';
import { transformTsrxModule } from '../src/transform.ts';

test('used storage forces the generated resume module onto the full handoff', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/src/App.tsrx',
		source: `
import { state, storage } from '@markless/core';
export const theme = storage('theme-mode', 'light');
export function App() @{
	let count = state(0);
	<main data-theme={theme}>
		<button onClick={() => count++}>Add</button>
		<output>{count}</output>
	</main>
}
`,
		environment: 'client',
	});
	const resumeSource = result.virtualModules.find((module) => module.type === 'resume')?.source;

	expect(resumeSource).toContain("import('@markless/core/web/resume')");
	expect(resumeSource).toContain('marklessFullResumeHandoff');
	expect(resumeSource).not.toContain('marklessResumeSpecializedScalarEvent');
});
