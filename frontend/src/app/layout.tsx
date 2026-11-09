import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nyaydari — Legal clarity, made simple",
  description:
    "Get a clearer starting point for your legal questions and documents with Nyaydari.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <SiteHeader />
        <main>{children}</main>
        <footer className="site-footer">
          <div className="footer-inner">
            <Link className="brand footer-brand" href="/">
              <span aria-hidden="true" className="brand-mark">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M12 3v18M5 7h14M7 7l-4 8h8L7 7Zm10 0-4 8h8l-4-8ZM7 21h10" />
                </svg>
              </span>
              <span>Nyay<span className="brand-light">dari</span></span>
            </Link>
            <span>Clearer first steps. Better-informed decisions.</span>
            <span>© {new Date().getFullYear()} Nyaydari</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
