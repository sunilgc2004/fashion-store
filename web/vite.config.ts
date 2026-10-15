import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// the proxy keeps cookies same-origin in dev, so no CORS setup is needed
export default defineConfig({ plugins: [react(), tailwindcss()], server: { proxy: { "/api": "http://localhost:4000" } } });
