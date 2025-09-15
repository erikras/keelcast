import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("/login", "routes/login.tsx"),
  route("/auth/callback", "routes/auth.callback.tsx"),
  route("/add", "routes/add.tsx"),
  route("/play/:episodeId", "routes/play.tsx"),
] satisfies RouteConfig;
