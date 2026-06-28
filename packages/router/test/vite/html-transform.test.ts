import { describe, expect, it } from 'vite-plus/test';
import { parseAst } from 'vite';
import { transformHtmlSource } from '../../src/vite/html-transform.ts';

describe('html transform', () => {
	it('appends html attribute helper from document.tsx root Html props', () => {
		const source = `import { Html } from "@arcade/router";
import type { PageProps } from "@arcade/router";

export default (props: PageProps) => {
  return (
    <Html lang="en" data-path={props.url.pathname} data-status={String(props.status)} data-arcadeRouter>
      <head />
      <body>
        {props.children}
      </body>
    </Html>
  );
};
`;

		const transformed = transform(source);

		expect(transformed).toContain('export default (props: PageProps)');
		expect(transformed).toContain(
			'export function __arcadeRouterHtmlAttributes(props: PageProps)',
		);
		expect(transformed).toContain('"lang": "en"');
		expect(transformed).toContain('"data-path": props.url.pathname');
		expect(transformed).toContain('"data-status": String(props.status)');
		expect(transformed).toContain('"data-arcadeRouter": true');
		expect(transformed).not.toContain('arcadeRouter-html');
		expect(transformed).not.toContain('html.replace');
	});

	it('appends html attribute helper from document.jsx root Html props', () => {
		const source = `import { Html } from "@arcade/router";

export default (props) => {
  return (
    <Html lang="en" data-path={props.url.pathname}>
      <body>
        {props.children}
      </body>
    </Html>
  );
};
`;

		const transformed = transform(source, 'jsx', '/project/document.jsx');

		expect(transformed).toContain('export function __arcadeRouterHtmlAttributes(props)');
		expect(transformed).toContain('"data-path": props.url.pathname');
	});

	it('rejects document.tsx when the default component root is not Html', () => {
		expect(() =>
			transform(
				`import { Html } from "@arcade/router";

export default () => {
  return <body />;
};
`,
			),
		).toThrow(
			'ArcadeRouter expected document.tsx or document.jsx to return <Html> at the top level',
		);
	});

	it('rejects Html attributes that capture render-time locals', () => {
		expect(() =>
			transform(
				`import { Html } from "@arcade/router";

export default (props) => {
  const section = props.url.pathname.split("/")[1] || "home";

  return (
    <Html lang="en" data-section={section}>
      <body>
        {props.children}
      </body>
    </Html>
  );
};
`,
			),
		).toThrow('ArcadeRouter cannot use "section" in <Html data-section={...}>');
	});

	it('rejects Html spread attributes', () => {
		expect(() =>
			transform(
				`import { Html } from "@arcade/router";

export default (props) => {
  return (
    <Html {...props.html}>
      <body>
        {props.children}
      </body>
    </Html>
  );
};
`,
			),
		).toThrow('ArcadeRouter does not support spreading props onto <Html> yet');
	});
});

function transform(source: string, lang: 'jsx' | 'tsx' = 'tsx', id = '/project/document.tsx') {
	return transformHtmlSource(source, parseAst(source, { astType: 'ts', lang, range: true }, id));
}
