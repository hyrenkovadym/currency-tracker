// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // ✅ NBU (для металів через NBU_Exchange) — щоб не було CORS
      "/nbu": {
        target: "https://bank.gov.ua",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/nbu/, ""),
      },


  
      "/minfin": {
        target: "https://index.minfin.com.ua",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/minfin/, ""),
      },
      

       
       "/metals-api": {
         target: "https://metals-api.com",
         changeOrigin: true,
         secure: true,
         rewrite: (path) => path.replace(/^\/metals-api/, ""),
     },

     "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        secure: false,
      },

      "/goldapi": {
        target: "https://api.goldapi.io",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/goldapi/, ""),
      },
    },
  },
});
