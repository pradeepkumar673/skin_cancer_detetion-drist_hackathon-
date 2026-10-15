import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Courier_Prime } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/components/ui/Toast";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const courierPrime = Courier_Prime({
  variable: "--font-courier-prime",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "SkinSentry: Clinical Decision Support for Skin Lesions",
  description: "Automated multi-model dermatological screening and decision support.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${courierPrime.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var b=document.body;if(b&&b.hasAttribute('cz-shortcut-listen')){b.removeAttribute('cz-shortcut-listen');}}catch(e){}`,
          }}
        />
      </head>
      <body
        className="min-h-full flex flex-col bg-[#FEFFFF] text-[#17252A]"
        suppressHydrationWarning
      >
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
