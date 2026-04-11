import './globals.css'

export const metadata = {
  title: 'Clinic Admin Portal',
  description: 'AI-Powered Scheduling System',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, display: 'flex', height: '100vh', backgroundColor: '#f4f7f6', fontFamily: 'Arial, sans-serif' }}>
        
        {/* SIDEBAR NAVIGATION */}
        <aside style={{ width: '250px', backgroundColor: '#2c3e50', color: 'white', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <h2 style={{ borderBottom: '1px solid #34495e', paddingBottom: '10px' }}>🏥 Clinic Admin</h2>
          <a href="/" style={{ color: '#ecf0f1', textDecoration: 'none', padding: '10px', backgroundColor: '#34495e', borderRadius: '5px' }}>📅 Timetable</a>
          <a href="/vaccines" style={{ color: '#ecf0f1', textDecoration: 'none', padding: '10px' }}>💉 Vaccines</a>
          <a href="/blood-tests" style={{ color: '#ecf0f1', textDecoration: 'none', padding: '10px' }}>🩸 Blood Tests</a>
          <a href="/patients" style={{ color: '#ecf0f1', textDecoration: 'none', padding: '10px' }}>👥 Patients</a>
          <a href="/bot-settings" style={{ color: '#ecf0f1', textDecoration: 'none', padding: '10px' }}>🤖 Bot Auto-Replies</a>
          
          <div style={{ marginTop: 'auto' }}>
            <a href="/login" style={{ color: '#e74c3c', textDecoration: 'none', fontWeight: 'bold' }}>🚪 Logout</a>
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