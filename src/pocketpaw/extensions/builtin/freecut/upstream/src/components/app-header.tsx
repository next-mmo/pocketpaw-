import { Link, useRouterState } from "@tanstack/react-router";
import { Github, Settings, FolderOpen, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FreeCutLogo } from "@/components/brand/freecut-logo";
import { cn } from "@/shared/ui/cn";

/**
 * Shared application header displayed across all pages except the editor.
 *
 * Provides consistent navigation:
 *   - Logo (home → projects)
 *   - Nav links: Projects, About, Settings
 *   - GitHub link
 */
export function AppHeader() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  // Don't render on editor pages — editor has its own toolbar
  if (currentPath.startsWith("/editor")) {
    return null;
  }

  const navLinks = [
    { to: "/projects" as const, label: "Projects", icon: FolderOpen },
    { to: "/settings" as const, label: "Settings", icon: Settings },
    { to: "/about" as const, label: "About", icon: Info },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg supports-backdrop-filter:bg-background/60">
      <div className="max-w-[1920px] mx-auto px-6 flex h-14 items-center justify-between">
        {/* Left: Logo */}
        <Link
          to="/projects"
          className="hover:opacity-80 transition-opacity"
          aria-label="Home"
        >
          <FreeCutLogo variant="full" size="sm" />
        </Link>

        {/* Center: Navigation */}
        <nav className="flex items-center gap-1">
          {navLinks.map(({ to, label, icon: Icon }) => {
            const isActive =
              currentPath === to ||
              (to === "/projects" && currentPath.startsWith("/projects"));
            return (
              <Link key={to} to={to}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "gap-2 text-muted-foreground hover:text-foreground transition-colors",
                    isActive && "text-foreground bg-accent/50",
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{label}</span>
                </Button>
              </Link>
            );
          })}
        </nav>

        {/* Right: GitHub */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9" asChild>
            <a
              href="https://github.com/peopleinfo/freecut"
              target="_blank"
              rel="noopener noreferrer"
              data-tooltip="View on GitHub"
              data-tooltip-side="bottom"
              aria-label="View on GitHub"
            >
              <Github className="w-4 h-4" />
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}
