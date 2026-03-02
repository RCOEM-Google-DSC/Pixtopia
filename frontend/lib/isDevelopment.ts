// Set NEXT_PUBLIC_IS_DEV=true  → dev mode (no auth required on any page)
// Set NEXT_PUBLIC_IS_DEV=false → production mode (all pages protected)
export const isDevelopment = process.env.NEXT_PUBLIC_IS_DEV === "true";
