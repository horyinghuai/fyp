"use client";

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navItems = [
    { name: 'Timetable', path: '/', icon: '📅' },
    { name: 'Vaccines', path: '/vaccines', icon: '💉' },
    { name: 'Blood Tests', path: '/blood_test', icon: '🩸' },
    { name: 'Patients', path: '/patients', icon: '👥' },
  ];

  return (
    <html lang="en">
      <body style={{ margin: 0, display: 'flex', height: '100vh', backgroundColor: '#F3F4F6', fontFamily: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}>
        
        {/* SIDEBAR NAVIGATION */}
        <aside style={{ width: '260px', backgroundColor: '#1E293B', color: 'white', display: 'flex', flexDirection: 'column', boxShadow: '4px 0 10px rgba(0,0,0,0.1)', zIndex: 10 }}>
          <div style={{ padding: '25px 20px', borderBottom: '1px solid #334155', marginBottom: '15px' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '600', letterSpacing: '0.5px' }}>🏥 Clinic Admin</h2>
            <p style={{ margin: '5px 0 0 0', fontSize: '0.8rem', color: '#94A3B8' }}>Smart Scheduling System</p>
          </div>
          
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 15px' }}>
            {navItems.map((item) => {
              const isActive = pathname === item.path;
              return (
                <Link key={item.path} href={item.path} style={{
                  color: isActive ? '#FFFFFF' : '#CBD5E1',
                  textDecoration: 'none',
                  padding: '12px 15px',
                  backgroundColor: isActive ? '#3B82F6' : 'transparent',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontWeight: isActive ? '600' : '400',
                  transition: 'all 0.2s ease',
                }}>
                  <span style={{ fontSize: '1.2rem' }}>{item.icon}</span>
                  {item.name}
                </Link>
              );
            })}
          </nav>
          
          <div style={{ marginTop: 'auto', padding: '20px' }}>
            <button style={{ width: '100%', padding: '12px', backgroundColor: '#EF4444', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: '10px', transition: 'background 0.2s' }}>
              <span>🚪</span> Logout
            </button>
          </div>
        </aside>

        {/* MAIN PAGE CONTENT */}
        <main style={{ flex: 1, padding: '30px 40px', overflowY: 'auto' }}>
          {children}
        </main>

      </body>
    </html>
  );
}