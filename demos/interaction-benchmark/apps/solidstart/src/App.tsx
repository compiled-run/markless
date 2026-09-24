import { SidebarTree } from "./components/SidebarTree";
import { paths, Router } from "./router";
import { SIDEBAR_TREE, SITE_TITLE } from "./shared/data";
import "./shared/styles.css";

export default function App() {
  return (
    <Router>
      {(props) => (
        <div class="app">
          <header class="app-header">
            <span class="app-brand">{SITE_TITLE}</span>
            <nav class="app-nav" aria-label="Main">
              <a href={paths()} data-testid="nav-overview">Overview</a>
              <a href={paths.records()} data-testid="nav-records">Records</a>
              <a href={paths.settings()} data-testid="nav-settings">Settings</a>
            </nav>
          </header>
          <div class="app-body">
            <aside class="sidebar" aria-label="Sections">
              <SidebarTree nodes={SIDEBAR_TREE} />
            </aside>
            <main class="main">
              {props.children}
            </main>
          </div>
        </div>
      )}
    </Router>
  );
}
