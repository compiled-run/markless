import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'pathe';

const RESUME_MODULE_ATTRIBUTE = /\bdata-markless-resume-module="([^"]+)"/;
const STATIC_IMPORT = /\b(?:import|export)\s*(?:[\w$*{}\s,]*?\bfrom\s*)?["'](\.{1,2}\/[^"']+)["']/g;

/** The resume module the server render names, which is the URL production serves. */
export function servedResumeModuleUrl(html: string): string {
	const url = RESUME_MODULE_ATTRIBUTE.exec(html)?.[1];
	if (!url) throw new Error('served page names no resume module');
	return url;
}

/** Every built file the resume module imports statically, itself included: what the browser evaluates to resume. */
export async function resumeModuleClosure(
	dist: string,
	url: string,
): Promise<{ readonly files: readonly string[]; readonly source: string }> {
	const seen = new Map<string, string>();
	const pending = [url];
	while (pending.length > 0) {
		const path = pending.pop()!;
		if (seen.has(path)) continue;
		const source = await readFile(resolve(dist, `.${path}`), 'utf8');
		seen.set(path, source);
		for (const match of source.matchAll(STATIC_IMPORT))
			pending.push(join(dirname(path), match[1]!));
	}
	return { files: [...seen.keys()], source: [...seen.values()].join('\n') };
}
