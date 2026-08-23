import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  plugins: [react()],
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/health": "http://127.0.0.1:3100",
    },
  },
});
