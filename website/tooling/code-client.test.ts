import { expect, it } from 'vitest';
import { codeFrameHtml, dropSitePreloads } from './code-client.ts';

it('keeps the frame its own preloads and drops the site-wide list the bundler injects', () => {
	const html = codeFrameHtml('/build/frame.js', ['/build/runtime.js']);
	const injected = html.replace(
		'</head>',
		'<link rel=modulepreload href=/build/a.js crossorigin fetchpriority=high><link rel=modulepreload href=/build/b.js crossorigin></head>',
	);
	const kept = dropSitePreloads(injected);
	expect(kept).toContain('<link rel="modulepreload" href="/build/runtime.js">');
	expect(kept).toContain('<script type="module" src="/build/frame.js"></script>');
	expect(kept).not.toContain('/build/a.js');
	expect(kept).not.toContain('/build/b.js');
	expect(kept).toContain('<body class="code-stage" data-code-frame>');
});
