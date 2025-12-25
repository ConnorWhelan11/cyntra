import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Tauri v2: `invoke` lives in `@tauri-apps/api/core` (keep legacy import path working)
      "@tauri-apps/api/tauri": "@tauri-apps/api/core",
      // QuantumField direct import for PCB background
      "@quantum-field": path.resolve(__dirname, "../../packages/ui/src/components/three/QuantumField"),
      react: path.resolve(__dirname, "../../node_modules/react"),
      "react-dom": path.resolve(__dirname, "../../node_modules/react-dom"),
      "react-dom/client": path.resolve(__dirname, "../../node_modules/react-dom/client.js"),
      "react-dom/test-utils": path.resolve(__dirname, "../../node_modules/react-dom/test-utils.js"),
      "react/jsx-runtime": path.resolve(__dirname, "../../node_modules/react/jsx-runtime.js"),
      "react/jsx-dev-runtime": path.resolve(__dirname, "../../node_modules/react/jsx-dev-runtime.js"),
    },
    dedupe: ["react", "react-dom", "three", "@react-three/fiber", "@react-three/drei"],
  },
  define: {
    "process.env": {},
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
  },
  css: {
    postcss: "./postcss.config.js",
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: ["es2021", "chrome105", "safari13"],
    minify: process.env.TAURI_DEBUG ? false : "esbuild",
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
