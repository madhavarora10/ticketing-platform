import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "TicketFlow — Dynamic Event Ticketing",
  description:
    "Book event tickets with intelligent dynamic pricing. Real-time availability, distributed booking protection.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <nav className="navbar">
          <div className="navbar-inner">
            <Link href="/" className="navbar-logo">
              TicketFlow
            </Link>
            <div className="navbar-center">
              <ul className="navbar-links">
                <li><Link href="/">Events</Link></li>
                <li><Link href="/my-bookings">My Bookings</Link></li>
                <li><Link href="/analytics">Analytics</Link></li>
              </ul>
            </div>
            <div className="navbar-admin-group">
              <span className="navbar-admin-label">Admin</span>
              <ul className="navbar-links">
                <li><Link href="/admin/events" className="nav-admin-link">Create Event</Link></li>
                <li><Link href="/admin/tests" className="nav-admin-link">Run Tests</Link></li>
                <li><Link href="/admin/config" className="nav-admin-link">Config</Link></li>
              </ul>
            </div>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
