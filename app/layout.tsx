import "./globals.css";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import Sidebar from "@/components/Sidebar";

const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#06382a",
};

export const metadata = {
  title: "Baliraja Farm Fresh · Cost & Margin",
  description: "Baliraja Farm Fresh export cost, quote and margin dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <div className="min-h-screen flex flex-col md:flex-row">
          <Sidebar />
          {/* Bottom padding on phones keeps content clear of the tab bar. */}
          <main className="flex-1 min-w-0 px-4 pt-5 pb-28 sm:px-6 md:px-10 md:py-8">
            <div className="mx-auto max-w-6xl space-y-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
