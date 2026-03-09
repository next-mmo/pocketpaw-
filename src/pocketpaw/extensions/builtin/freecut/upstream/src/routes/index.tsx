import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    // Always redirect to projects (the home page)
    throw redirect({ to: "/projects" });
  },
  component: () => null,
});
