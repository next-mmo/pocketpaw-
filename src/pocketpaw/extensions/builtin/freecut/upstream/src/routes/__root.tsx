import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AppHeader } from "@/components/app-header";

export const Route = createRootRoute({
  component: () => (
    <>
      <AppHeader />
      <Outlet />
    </>
  ),
});
