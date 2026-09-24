import type { Handle, RemixNode } from 'remix/ui'
import { ImportMap } from 'remix/ui/server'

import { scriptEntry, stylesHref } from '../assets.ts'
import { buildId } from '../build-id.ts'
import { ROUTES, SITE_TITLE, documentTitle, type RouteId } from '../shared/data.ts'
import { SidebarTree } from './public/sidebar-tree.tsx'

export interface DocumentProps {
  children?: RemixNode
  route: RouteId
}

export function Document(handle: Handle<DocumentProps>) {
  return () => {
    let { children, route } = handle.props
    let current = ROUTES.find((info) => info.id === route)!
    let { href, importMap, preloads } = scriptEntry

    return (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="benchmark:entrant" content="remix3" />
          <meta name="benchmark:build" content={buildId} />
          <title>{documentTitle(current)}</title>
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <link rel="stylesheet" href={stylesHref} />
          <ImportMap value={importMap} />
          {preloads.map((preloadHref) => (
            <link key={preloadHref} rel="modulepreload" href={preloadHref} />
          ))}
          <script type="module" src={href}></script>
        </head>
        <body>
          <div className="app">
            <header className="app-header">
              <span className="app-brand">{SITE_TITLE}</span>
              <nav className="app-nav" aria-label="Main">
                {ROUTES.map((info) => (
                  <a
                    key={info.id}
                    href={info.path}
                    data-testid={info.navTestId}
                    aria-current={info.id === route ? 'page' : undefined}
                  >
                    {info.title}
                  </a>
                ))}
              </nav>
            </header>
            <div className="app-body">
              <aside className="sidebar" aria-label="Sections">
                <SidebarTree />
              </aside>
              <main className="main">
                <h1 className="page-title" data-testid="page-title">
                  {current.title}
                </h1>
                {children}
              </main>
            </div>
          </div>
        </body>
      </html>
    )
  }
}
