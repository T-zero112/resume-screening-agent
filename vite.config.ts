import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import "dotenv/config";
import { jobApiPlugin } from "./src/jobs/job-api.js";

export default defineConfig({
  plugins: [react(), jobApiPlugin()],
});
