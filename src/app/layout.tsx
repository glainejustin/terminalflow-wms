import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./retail.css";
import "./ops.css";

export const metadata: Metadata = {
  title: "Terminalflow | Retail Consolidation OS",
  description: "Airport retailer goods: receive at the consolidation center, screen, store, dispatch to the airport and confirm delivery to terminal stores, with a full operator audit trail.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
