import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        privacidad: resolve(import.meta.dirname, "privacidad.html"),
        condiciones: resolve(import.meta.dirname, "condiciones.html"),
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
