import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "./components/Navbar";
import AuthGuard from "./components/AuthGuard";
import { SimulatedTimeProvider } from "@/contexts/SimulatedTimeContext";
import { ShiftProvider } from "@/contexts/ShiftContext";
import ShiftLockBanner from "./components/ShiftLockBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hotel PMS",
  description: "ระบบบริหารจัดการโรงแรม",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="flex flex-col min-h-screen">
        <AuthGuard>
          <SimulatedTimeProvider>
            <ShiftProvider>
              {/* Top Navbar - รองรับมือถือแล้ว */}
              <Navbar />
              <ShiftLockBanner />

              {/* Main Content */}
              <main className="flex-1 w-full max-w-7xl mx-auto px-2 py-3 sm:p-6 lg:p-8">
                {children}
              </main>
            </ShiftProvider>
          </SimulatedTimeProvider>
        </AuthGuard>
      </body>
    </html>
  );
}
