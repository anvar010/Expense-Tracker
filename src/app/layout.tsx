import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MotionProvider } from "@/components/motion";
import { PwaRegister } from "@/components/pwa";
import { DataProvider } from "@/lib/store/data-provider";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Expense Tracker",
  description: "Track spending, understand where your money goes.",
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Spendly", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { themeColor: "#0f172a" };

// Applies the saved theme before paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem('et:theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="min-h-full"><MotionProvider><DataProvider>{children}</DataProvider><PwaRegister /></MotionProvider></body>
    </html>
  );
}
