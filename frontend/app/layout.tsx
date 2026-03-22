import type { Metadata } from "next";
import { Bebas_Neue } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/authContext";
import { Toaster } from "@/components/ui/sonner";

const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
});

export const metadata: Metadata = {
  title: "Pixtopia — GDG Event",
  description: "A Pixar-themed team competition event by GDG",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={bebasNeue.variable}>
      <head>
        {/* Pre-connect to Supabase — crossOrigin is required because auth
            API calls are CORS requests; without it the connection can't be reused */}
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL!} crossOrigin="anonymous" />
        <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL!} />
      </head>
      <body className="antialiased">
        <AuthProvider>
          {children}
          <Toaster position="top-right" theme="dark" closeButton />
        </AuthProvider>
      </body>
    </html>
  );
}



