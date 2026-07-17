import { bootstrapApp } from "./bootstrap/appBootstrap.js?v=codex10-2";

bootstrapApp().catch((error) => {
  console.error("Application bootstrap failed.", error);
});
