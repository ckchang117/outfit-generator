/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@supabase/supabase-js",
    "@supabase/ssr",
    "@supabase/realtime-js",
    "@supabase/auth-js",
    "@supabase/node-fetch",
  ],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack(config, { dev }) {
    // Disable eval/sourcemap in dev to avoid eval-wrapped modules causing SyntaxError in some browsers
    if (dev) config.devtool = false
    return config
  },
}

export default nextConfig