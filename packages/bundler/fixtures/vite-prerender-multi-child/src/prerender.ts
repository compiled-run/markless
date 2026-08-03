const shell = document.querySelector('[data-multi-child]');
const resumer = document.querySelector('[data-async-resumer][data-markless-resume-module]');
if (!shell || !resumer) {
	throw new Error('Expected the built multi-child prerender shell and resumer.');
}
