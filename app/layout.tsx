import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import AuthControls from '@/src/components/auth-controls'

export const metadata: Metadata = {
  title: 'v0 App',
  description: 'Created with v0',
  generator: 'v0.dev',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <style>{`
html {
  font-family: ${GeistSans.style.fontFamily};
  --font-sans: ${GeistSans.variable};
  --font-mono: ${GeistMono.variable};
}
        `}</style>
      </head>
      <body>
        <header className="border-b bg-white sticky top-0 z-10">
          <div className="mx-auto max-w-md lg:max-w-2xl px-4 py-4 flex items-center justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Outfit Generator</h1>
              <p className="text-xs text-neutral-500 mt-0.5">Build your closet and spin up looks</p>
            </div>
            <div className="ml-4">
              <AuthControls />
            </div>
          </div>
        </header>
        {children}
      </body>
    </html>
  )
}
