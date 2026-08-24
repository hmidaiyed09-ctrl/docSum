/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfjs-dist optionally requires the node 'canvas' package; disable it for the client bundle.
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
