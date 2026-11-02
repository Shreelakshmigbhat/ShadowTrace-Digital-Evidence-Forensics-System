import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { getSession } from "@/lib/auth";
import Nav from "@/components/core/Nav";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "ShadowTrace",
  description: "Digital evidence forensics: investigations, evidence and chain of custody",
};

// Every page gets the shared navigation once the user is logged in (the login page has none).
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} bg-slate-50 text-slate-900 antialiased`}>
        {session && <Nav session={session} />}
        {children}
      </body>
    </html>
  );
}
