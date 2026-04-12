"use client";

import './globals.css';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Calendar, Syringe, Droplet, Users, MessageSquare, LogOut, Bell, UserCircle, Settings, Stethoscope } from 'lucide-react';
import { useState, useEffect } from 'react';

const CLINIC_ID = "c1111111-1111-1111-1111-111111111111"; // Assuming active clinic ID

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [clinicName, setClinicName] = useState("Loading...");

  useEffect(() => {
    // Exclude login page from fetching layout data or showing layout UI
    if (pathname !== '/login') {
      fetch(`http://127.0.0.1:8000/clinic/${CLINIC_ID}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.name) setClinicName(data.name);
          else setClinicName("Smart Admin Portal");
        })
        .catch(() => setClinicName("Smart Admin Portal"));
    }
  }, [pathname]);

  if (pathname === '/login') {
    return <html lang="en"><body>{children}</body></html>;
  }

  const navItems = [
    { name: 'Timetable', path: '/', icon: <Calendar size={20} /> },
    { name: 'Vaccines', path: '/vaccines', icon: <Syringe size={20} /> },
    { name: 'Blood Tests', path: '/blood_test', icon: <Droplet size={20} /> },
    { name: 'Patients', path: '/patients', icon: <Users size={20} /> },
    { name: 'Doctors', path: '/doctors', icon: <Stethoscope size={20} /> },
    { name: 'Bot Replies', path: '/bot-settings', icon: <MessageSquare size={20} /> },
  ];

  const handleLogout = () => {
    // Clear any auth tokens here if implemented
    router.push('/login');
  };

  return (
    <html lang="en">
      <body className="m-0 flex h-screen bg-slate-50 font-sans text-slate-800">
        <aside className="w-64 bg-slate-900 text-white flex flex-col shadow-xl z-20">
          <div className="p-6 border-b border-slate-800">
            <h2 className="text-xl font-bold tracking-wide flex items-center gap-2"><span className="text-blue-400">⚡</span> AICAS</h2>
            <p className="text-xs text-slate-400 mt-1 font-medium tracking-wider uppercase truncate" title={clinicName}>{clinicName}</p>
          </div>
          <nav className="flex-1 p-4 space-y-2">
            {navItems.map((item) => {
              const isActive = pathname === item.path;
              return (
                <Link key={item.path} href={item.path} prefetch={false} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isActive ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                  {item.icon} <span className="font-medium">{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          <header className="h-16 bg-white shadow-sm flex items-center justify-end px-8 z-10">
            <div className="flex items-center gap-6 relative">
              <div className="relative cursor-pointer" onClick={() => setShowNotifications(!showNotifications)}>
                <Bell size={22} className="text-slate-600 hover:text-blue-600 transition" />
              </div>
              
              {/* User Menu */}
              <div className="relative">
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => setShowUserMenu(!showUserMenu)}>
                  <UserCircle size={30} className="text-slate-400 hover:text-blue-600 transition" />
                  <span className="font-medium text-sm text-slate-700">Admin</span>
                </div>

                {showUserMenu && (
                  <div className="absolute top-10 right-0 w-48 bg-white shadow-2xl rounded-xl border border-slate-100 overflow-hidden z-50">
                    <div className="p-2">
                      <button onClick={() => { setShowUserMenu(false); router.push('/settings'); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition text-left">
                        <Settings size={16} /> Settings
                      </button>
                      <div className="border-t border-slate-100 my-1"></div>
                      <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition text-left">
                        <LogOut size={16} /> Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </header>
          <main className="flex-1 p-8 overflow-y-auto bg-[#F8FAFC]">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}