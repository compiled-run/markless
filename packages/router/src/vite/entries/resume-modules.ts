// Every route's resume module: a build entry no page loads, so each module gets its chunk; dev resumes through it.
export const mdxResumeModules = import.meta.glob('/pages/**/*.mdx', {
	query: '?markless-resume',
});
export const tsrxResumeModules = import.meta.glob('/pages/**/*.tsrx', {
	query: '?markless-resume',
});
