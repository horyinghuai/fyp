"use client";

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, Syringe, Droplet, Users, MessageSquare, LogOut, Bell, Search, UserCircle } from 'lucide-react';
import { useState } from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [showNotifications, setShowNotifications] = useState(false);

  const navItems = [
    { name: 'Timetable', path: '/', icon: <Calendar size={20} /> },
    { name: 'Vaccines', path: '/vaccines', icon: <Syringe size={20} /> },
    { name: 'Blood Tests', path: '/blood_test', icon: <Droplet size={20} /> },
    { name: 'Patients', path: '/patients', icon: <Users size={20} /> },
    { name: 'Bot Replies', path: '/bot-settings', icon: <MessageSquare size={20} /> },
  ];

  return (
    <html lang="en">
      <body className="m-0 flex h-screen bg-slate-50 font-sans text-slate-800">
        
        {/* SIDEBAR */}
        <aside className="w-64 bg-slate-900 text-white flex flex-col shadow-xl z-20">
          <div className="p-6 border-b border-slate-800">
            <h2 className="text-xl font-bold tracking-wide flex items-center gap-2">
              <span className="text-blue-400">⚡</span> ClinicOS
            </h2>
            <p className="text-xs text-slate-400 mt-1 font-medium tracking-wider uppercase">Smart Admin Portal</p>
          </div>
          
          <nav className="flex-1 p-4 space-y-2">
            {navItems.map((item) => {
              const isActive = pathname === item.path;
              return (
                <Link key={item.path} href={item.path} 
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isActive ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                  {item.icon}
                  <span className="font-medium">{item.name}</span>
                </Link>
              );
            })}
          </nav>
          
          <div className="p-4">
            <button className="flex items-center justify-center gap-2 w-full py-3 bg-slate-800 text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-all font-semibold">
              <LogOut size={18} /> Logout
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          
          {/* TOP NOTIFICATION BAR */}
          <header className="h-16 bg-white shadow-sm flex items-center justify-between px-8 z-10">
            <div className="flex items-center bg-slate-100 px-4 py-2 rounded-full w-96">
              <Search size={18} className="text-slate-400 mr-2" />
              <input type="text" placeholder="Search patients or IC..." className="bg-transparent border-none outline-none w-full text-sm" />
            </div>

            <div className="flex items-center gap-6 relative">
              {/* Notification Bell */}
              <div className="relative cursor-pointer" onClick={() => setShowNotifications(!showNotifications)}>
                <Bell size={22} className="text-slate-600 hover:text-blue-600 transition" />
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center animate-pulse">3</span>
              </div>

              {/* Notification Dropdown */}
              {showNotifications && (
                <div className="absolute top-10 right-10 w-80 bg-white shadow-2xl rounded-xl border border-slate-100 overflow-hidden">
                  <div className="p-4 border-b bg-slate-50"><h4 className="font-bold text-slate-700">Notifications</h4></div>
                  <div className="p-4 border-b hover:bg-slate-50 cursor-pointer">
                    <p className="text-sm font-semibold text-red-500">Urgent: Missed Stage</p>
                    <p className="text-xs text-slate-500">John Smith missed Dose 2 (HPV).</p>
                  </div>
                  <div className="p-4 hover:bg-slate-50 cursor-pointer">
                    <p className="text-sm font-semibold text-blue-600">Bot Alert</p>
                    <p className="text-xs text-slate-500">3 new patients registered via Telegram today.</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 cursor-pointer">
                <UserCircle size={30} className="text-slate-400" />
                <span className="font-medium text-sm text-slate-700">Admin</span>
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