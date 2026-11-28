export const HEAD = 'You are taking part in a study of package naming. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.';
export const CONTEXT = 'Markless is a UI framework whose components are written in `.tsrx` files. In `.tsrx`, a component body is `@{ statements; one root element }` and runs once; `state()` values update the page when assigned; `@if`/`@else` and `@for` are template blocks. One codebase is built as an iPhone app, an Android app and a website.';
export const PERSONA = {
	beginner: 'Answer as a web developer about one year into your first job: you have built a few React sites and followed tutorials, and you are still learning the ecosystem. Use the words you would naturally use.',
	experienced: 'Answer as a web developer who has built websites and web apps for many years and has used several component libraries. Use the words you would naturally use.',
	mobile: 'Answer as a developer who builds phone apps for iPhone and Android (Swift, Kotlin or React Native). Use the words you would naturally use.',
};
