import { bootstrapApp } from "./bootstrap/appBootstrap.js?v=codex12-4";

bootstrapApp().catch((error) => {
  console.error("Application bootstrap failed.", error);
});
