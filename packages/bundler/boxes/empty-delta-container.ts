type PreviewServer = {
	request(path: string): Promise<string>;
};

const HASHED_WAKE_MODULE = /^\/build\/chunk-[A-Za-z0-9_-]+\.js$/;

/**
 * Proves that prerender-shaped SSR ships no serialized delta and points its
 * inline resumer at a real, hash-addressed browser wake module.
 */
export async function assertEmptyDeltaContainer(
	preview: PreviewServer,
	html: string,
	label: string,
): Promise<string> {
	const payloadScripts =
		html.match(/<script\b[^>]*\btype=["']markless\/(?:state|view)["'][^>]*>/g) ?? [];
	if (payloadScripts.length !== 0) {
		throw new Error(
			`Expected ${label} to ship zero markless/state and markless/view payload scripts, saw ${payloadScripts.length}.`,
		);
	}
	if (!/<script\b[^>]*\bdata-async-resumer\b/.test(html)) {
		throw new Error(`Expected ${label} to ship the inline data-async-resumer bootstrap.`);
	}
	const resumeModuleUrl = /\bdata-markless-resume-module=["']([^"']+)["']/.exec(html)?.[1];
	if (!resumeModuleUrl || !HASHED_WAKE_MODULE.test(resumeModuleUrl)) {
		throw new Error(
			`Expected ${label} to point at a hash-addressed prerender wake module, got ${resumeModuleUrl ?? '(missing)'}.`,
		);
	}

	// Witness request() throws for non-200 responses. The extension, nonempty
	// source, and HTML rejection prove the successful response is JavaScript.
	const wakeSource = await preview.request(resumeModuleUrl);
	if (wakeSource.trim().length === 0 || /<!doctype\s+html|<html\b/i.test(wakeSource)) {
		throw new Error(`Expected ${resumeModuleUrl} to serve nonempty JavaScript.`);
	}
	return resumeModuleUrl;
}
