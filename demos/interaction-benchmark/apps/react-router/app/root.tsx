import { Links, Meta, NavLink, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import { ROUTES, SITE_TITLE } from "./shared/data";
import stylesheet from "./shared/styles.css?url";
import { SidebarTree } from "./components/sidebar-tree";

export const links: Route.LinksFunction = () => [{ rel: "stylesheet", href: stylesheet }];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="benchmark:entrant" content="react-router" />
        <meta name="benchmark:build" content={__BENCHMARK_BUILD_ID__} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <span className="app-brand">{SITE_TITLE}</span>
        <nav className="app-nav" aria-label="Main">
          {ROUTES.map((r) => (
            <NavLink key={r.id} to={r.path} end data-testid={r.navTestId}>
              {r.title}
            </NavLink>
          ))}
        </nav>
      </header>
      <div className="app-body">
        <aside className="sidebar" aria-label="Sections">
          <SidebarTree />
        </aside>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
