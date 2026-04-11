import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows Live Reloading (HMR) when accessing via your Wi-Fi IP address
  allowedDevOrigins: ["10.0.5.201", "localhost"],
};

export default nextConfig;