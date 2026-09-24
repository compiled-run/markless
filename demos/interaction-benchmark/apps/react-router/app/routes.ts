import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/overview.tsx"),
  route("records", "routes/records.tsx"),
  route("settings", "routes/settings.tsx"),
  route("api/settings", "routes/api.settings.ts"),
] satisfies RouteConfig;
