import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The game now lives on its own domain (atomicbunch.com), so it is served from the root "/".
// (It was "/atomic-six/" while the game lived at username.github.io/atomic-six/.)
export default defineConfig({
  plugins: [react()],
  base: "/",
});
