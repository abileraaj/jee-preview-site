import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets phones and laptops on the same Wi-Fi open the dev site by IP
  // address (e.g. http://192.168.11.1:3000). Development only.
  allowedDevOrigins: ["192.168.*.*"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
