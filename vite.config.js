import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT: change "atomic-six" below to match your GitHub repo name exactly.
// This tells the built site "I live at username.github.io/atomic-six/", not at the root.
// If you set up a custom domain instead, change base back to "/".
export default defineConfig({
  plugins: [react()],
  base: "/atomic-six/",
});
