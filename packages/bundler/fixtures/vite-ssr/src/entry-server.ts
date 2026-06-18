import { renderToString } from 'arcade/runtime/render-to-string';
import { renderToStringInput } from './root.tsrx';

export function render(resumeModuleUrl = ''): string {
	return renderToString(renderToStringInput, { resumeModuleUrl });
}
