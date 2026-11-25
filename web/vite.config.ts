import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative base ensures assets work both locally and on GitHub Pages subpath (/jp-pixel-story/)
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    host: "127.0.0.1",
  },
});
