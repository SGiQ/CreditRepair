import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";
import { currentUser } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Credit Repair Desk",
  description: "Analyze credit reports, track negative items, and draft dispute letters for every client.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
            <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-emerald-700 text-sm text-white">CR</span>
              Credit Repair Desk
            </Link>
            {!user && (
              <Link href="/login" className="rounded-md border border-stone-300 bg-white px-3.5 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-50">
                Client sign in
              </Link>
            )}
            {user && (
              <div className="flex items-center gap-4 text-sm">
                {user.role === "admin" && (
                  <>
                    <Link href="/" className="font-medium text-stone-700 hover:text-stone-950">
                      Dashboard
                    </Link>
                    <Link href="/admin" className="font-medium text-stone-700 hover:text-stone-950">
                      Accounts
                    </Link>
                  </>
                )}
                <span className="hidden text-stone-500 sm:inline">{user.email}</span>
                <SignOutButton />
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8">{children}</main>
        <footer className="mx-auto w-full max-w-7xl px-5 pb-8 text-xs leading-relaxed text-stone-500">
          Drafting and tracking tool — not legal advice. Dispute only information that is inaccurate, incomplete, or
          unverifiable, and review every letter before it is mailed.
        </footer>
      </body>
    </html>
  );
}
