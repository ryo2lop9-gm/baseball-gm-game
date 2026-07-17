import { bootstrapApp } from "./bootstrap/appBootstrap.js";

bootstrapApp().catch((error) => {
  console.error("Application bootstrap failed.", error);
});
