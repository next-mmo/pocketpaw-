import { useState, Suspense } from "react";
import browserCollections from "fumadocs-mdx:collections/browser";
import "./index.css";

// Create client loader from browser collections
const clientLoader = browserCollections.docs.createClientLoader({
  component({ frontmatter, default: MDX }) {
    return (
      <article className="prose">
        <h1>{frontmatter.title as string}</h1>
        {frontmatter.description && (
          <p className="description">{frontmatter.description as string}</p>
        )}
        <MDX />
      </article>
    );
  },
});

// Get all raw entries to build sidebar
// Raw keys are like `./architecture.mdx`, but the loader strips the `./` prefix.
const rawEntries = browserCollections.docs.raw;

interface NavItem {
  /** Path used by clientLoader (e.g. "architecture.mdx") */
  loaderPath: string;
  title: string;
}

function getNavItems(): NavItem[] {
  return Object.entries(rawEntries).map(([rawPath, entry]) => ({
    // The loader strips "./" from keys, so we do the same
    loaderPath: rawPath.startsWith("./") ? rawPath.slice(2) : rawPath,
    title:
      (entry as { frontmatter?: { title?: string } }).frontmatter?.title ??
      rawPath.replace(/^\.\//, "").replace(/\.mdx?$/, ""),
  }));
}

/** Renders a doc page via the client loader (uses React.use internally). */
function DocContent({ path }: { path: string }) {
  return clientLoader.useContent(path);
}

function App() {
  const navItems = getNavItems();
  // Default to index.mdx
  const defaultPath =
    navItems.find((i) => i.loaderPath === "index.mdx")?.loaderPath ??
    navItems[0]?.loaderPath ??
    "";
  const [activePath, setActivePath] = useState<string>(defaultPath);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="layout">
      {/* Header */}
      <header className="header">
        <button
          className="menu-toggle"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          ☰
        </button>
        <div className="logo">
          <span className="logo-icon">🎬</span>
          <span className="logo-text">FreeCut</span>
          <span className="logo-badge">Desktop Docs</span>
        </div>
        <div className="header-links">
          <a
            href="https://github.com/nicepkg/freecut"
            target="_blank"
            rel="noopener"
          >
            GitHub
          </a>
        </div>
      </header>

      <div className="main-container">
        {/* Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <nav>
            <div className="nav-section-title">Documentation</div>
            <ul className="nav-list">
              {navItems.map((item) => (
                <li key={item.loaderPath}>
                  <button
                    className={`nav-item ${activePath === item.loaderPath ? "active" : ""}`}
                    onClick={() => setActivePath(item.loaderPath)}
                  >
                    {item.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* Content */}
        <main className="content">
          <Suspense fallback={<p className="loading">Loading…</p>}>
            {activePath && <DocContent path={activePath} />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default App;
