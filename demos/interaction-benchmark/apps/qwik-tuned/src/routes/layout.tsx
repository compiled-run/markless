import { component$, Slot } from "@qwik.dev/core";
import { Link, useLocation } from "@qwik.dev/router";
import { ROUTES, SITE_TITLE } from "~/shared/data";
import { Tree } from "~/components/tree";

export default component$(() => {
  const location = useLocation();
  return (
    <div class="app">
      <header class="app-header">
        <span class="app-brand">{SITE_TITLE}</span>
        <nav class="app-nav" aria-label="Main">
          {ROUTES.map((route) => (
            <Link
              key={route.id}
              href={route.path}
              data-testid={route.navTestId}
              aria-current={
                location.url.pathname === route.path ? "page" : undefined
              }
            >
              {route.title}
            </Link>
          ))}
        </nav>
      </header>
      <div class="app-body">
        <aside class="sidebar" aria-label="Sections">
          <Tree />
        </aside>
        <main class="main">
          <Slot />
        </main>
      </div>
    </div>
  );
});
