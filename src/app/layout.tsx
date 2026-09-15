import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reddit Signals",
  description: "Find buyer-intent Reddit threads, draft replies in your voice, and track brand sentiment.",
};

/**
 * Root layout holds nothing but the document. The signed-in shell — sidebar,
 * project header, poll button — lives in the (app) route group, so the login
 * page can render on its own without any of it.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
