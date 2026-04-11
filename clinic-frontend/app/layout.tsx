import './globals.css';
import Link from 'next/link';

export const metadata = {
  title: 'Clinic Admin Portal',
  description: 'AI-Powered Scheduling System',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, display: 'flex', height: '100vh', backgroundColor: '#f4f7f6', fontFamily: 'Arial, sans-serif' }}>
        
        {/* SIDEBAR NAVIGATION */}
        <aside style={{ width: '250px', backgroundColor: '#2c3e50', color: 'white', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <h2 style={{ borderBottom: '1px solid #34495e', paddingBottom: '10px' }}>🏥 Clinic Admin</h2>
          
          <Link href="/" style={{ color: '#ecf0f1', textDecoration: 'none', padding: '10px', backgroundColor: '#34495e', borderRadius: '5px' }}>📅 Timetable</Link>
          <Link href="/vaccines" style={{ color: '#ecf0f1', textDecoration: 'none', padding: '10px' }}>💉 Vaccines</Link>
          <Link href="/blood_test" style={{ color: '#ecf0f1', textDecoration: 'none', padding: '10px' }}>🩸 Blood Tests</Link>
          <Link href="/patients" style={{ color: '#ecf0f1', textDecoration: 'none', padding: '10px' }}>👥 Patients</Link>
          <Link href="/bot-settings" style={{ color: '#ecf0f1', textDecoration: 'none', padding: '10px' }}>🤖 Bot Auto-Replies</Link>
          
          <div style={{ marginTop: 'auto' }}>
            <Link href="/login" style={{ color: '#e74c3c', textDecoration: 'none', fontWeight: 'bold' }}>🚪 Logout</Link>
          </div>
        </aside>

        {/* MAIN PAGE CONTENT */}
        <main style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
          {children}
        </main>

      </body>
    </html>
  )
}