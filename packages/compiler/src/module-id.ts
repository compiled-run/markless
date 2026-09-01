import type { SemanticGraphInput } from './artifacts.ts';

/** The id a module's minted ids are spelled from; the filename when the caller passed none. */
export function moduleIdOf(source: Pick<SemanticGraphInput, 'filename' | 'moduleId'>): string {
	return source.moduleId ?? source.filename;
}
