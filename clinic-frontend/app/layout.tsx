"use client";

import './globals.css';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Calendar, Syringe, Droplet, Users, MessageSquare, LogOut, Bell, UserCircle, Settings, Stethoscope, ShieldCheck, PlusCircle } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [clinicName, setClinicName] = useState("Loading...");
  const [pendingChatCount, setPendingChatCount] = useState(0);
  const [userSession, setUserSession] = useState<any>(null);
  const [isSessionLoaded, setIsSessionLoaded] = useState(false);

  useEffect(() => {
    if (pathname !== '/login' && pathname !== '/discovery') {
      const storedToken = localStorage.getItem('aicas_token');
      const storedUser = localStorage.getItem('aicas_user');
      
      if (!storedToken || !storedUser) {
          router.push('/login');
          return;
      }
      
      const parsedUser = JSON.parse(storedUser);
      setUserSession(parsedUser);
      setIsSessionLoaded(true);

      if (parsedUser.role !== 'developer') {
          const activeClinicId = parsedUser.clinic_id;
          
          const initializeData = async () => {
            try {
              const res = await fetch(`http://127.0.0.1:8000/clinic/${activeClinicId}`);
              if (res.ok) {
                const data = await res.json();
                setClinicName(data.name || "Smart Admin Portal");
              } else {
                setClinicName("Smart Admin Portal");
              }
            } catch (error) {
              setClinicName("Smart Admin Portal");
            }
          };

          const fetchPendingChats = async () => {
            try {
              const res = await fetch(`http://127.0.0.1:8000/admin/chat-pending-count/${activeClinicId}`);
              if (res.ok) {
                const data = await res.json();
                if (data && data.count !== undefined) {
                  setPendingChatCount(data.count);
                }
              }
            } catch (error) {}
          };

          initializeData();
          fetchPendingChats();
          
          const interval = setInterval(fetchPendingChats, 10000); 
          return () => clearInterval(interval);
      } else {
          setClinicName("AICAS Master System");
      }
    } else {
        setIsSessionLoaded(true);
    }
  }, [pathname, router]);

  if (!isSessionLoaded) return <html lang="en"><body></body></html>;
  
  // Fully Bypass Admin UI Layout for Public / Discovery Layer
  if (pathname === '/login' || pathname === '/discovery') return <html lang="en"><body>{children}</body></html>;

  const hasPermission = (moduleName: string) => {
      if (!userSession) return false;
      if (userSession.role === 'developer') return moduleName === 'DEVELOPER_ONLY';
      if (userSession.role === 'primary_admin' || userSession.role === 'temporary_admin') return true;
      if (!userSession.permissions) return false;
      if (userSession.permissions.includes('ALL')) return true;
      return userSession.permissions.includes(moduleName);
  };

  let navItems = [
    { name: 'Timetable', path: '/', icon: <Calendar size={20} />, module: 'APPOINTMENT_MANAGEMENT' },
    { name: 'Vaccines', path: '/vaccines', icon: <Syringe size={20} />, module: 'INVENTORY_MANAGEMENT' },
    { name: 'Blood Tests', path: '/blood_test', icon: <Droplet size={20} />, module: 'INVENTORY_MANAGEMENT' },
    { name: 'Patients', path: '/patients', icon: <Users size={20} />, module: 'PATIENT_REGISTRATION' },
    { name: 'Doctors', path: '/doctors', icon: <Stethoscope size={20} />, module: 'DOCTOR_MANAGEMENT' },
    { name: 'Bot Replies', path: '/bot-settings', icon: <MessageSquare size={20} />, module: 'CHAT_SUPPORT' },
  ];

  if (userSession?.role === 'primary_admin' || userSession?.role === 'temporary_admin') {
      navItems.push({ name: 'Staff & Permissions', path: '/staff', icon: <ShieldCheck size={20} />, module: 'ALL' });
  } else if (userSession?.role === 'developer') {
      navItems = [
          { name: 'Clinic Registration', path: '/developer', icon: <PlusCircle size={20} />, module: 'DEVELOPER_ONLY' }
      ];
  }

  const handleLogout = () => {
    localStorage.removeItem('aicas_token');
    localStorage.removeItem('aicas_user');
    router.push('/login');
  };

  const displayRole = userSession?.role?.replace('_', ' ').replace(/\b\w/g, (l:string) => l.toUpperCase());

  return (
    <html lang="en">
      <body className="m-0 flex h-screen bg-slate-50 font-sans text-slate-800">
        <aside className="w-64 bg-slate-900 text-white flex flex-col shadow-xl z-20">
          <div className="p-6 border-b border-slate-800">
            <h2 className="text-xl font-bold tracking-wide flex items-center gap-2"><span className="text-blue-400">⚡</span> AICAS</h2>
            <p className="text-xs text-slate-400 mt-1 font-medium tracking-wider uppercase truncate" title={clinicName}>{clinicName}</p>
          </div>
          <nav className="flex-1 p-4 space-y-2">
            {navItems.filter(item => hasPermission(item.module)).map((item) => {
              const isActive = pathname === item.path;
              return (
                <Link key={item.path} href={item.path} prefetch={false} className={`relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isActive ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                  {item.icon} <span className="font-medium">{item.name}</span>
                  {item.name === 'Bot Replies' && pendingChatCount > 0 && (
                      <span className="absolute right-4 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse shadow">
                          {pendingChatCount}
                      </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          <header className="h-16 bg-white shadow-sm flex items-center justify-end px-8 z-10">
            <div className="flex items-center gap-6 relative">
              
              {hasPermission('CHAT_SUPPORT') && (
                  <div className="relative cursor-pointer" onClick={() => setShowNotifications(!showNotifications)}>
                    <Bell size={22} className="text-slate-600 hover:text-blue-600 transition" />
                    {pendingChatCount > 0 && (
                         <span className="absolute -top-1 -right-1 bg-red-500 w-2.5 h-2.5 rounded-full shadow-sm ring-2 ring-white"></span>
                    )}
                  </div>
              )}
              
              {showNotifications && (
                  <div className="absolute top-10 right-40 w-64 bg-white shadow-2xl rounded-xl border border-slate-100 overflow-hidden z-50">
                     <div className="p-3">
                       <h4 className="font-bold text-sm text-slate-800 mb-2 border-b pb-2">Notifications</h4>
                       {pendingChatCount > 0 ? (
                           <div onClick={() => { setShowNotifications(false); router.push('/bot-settings'); }} className="p-3 bg-blue-50 text-blue-700 text-sm rounded-lg hover:bg-blue-100 transition cursor-pointer shadow-sm border border-blue-100">
                               You have <span className="font-black">{pendingChatCount}</span> unread message(s) from patients waiting in Bot Replies.
                           </div>
                       ) : (
                           <p className="text-sm text-slate-500 text-center py-2">No new notifications.</p>
                       )}
                     </div>
                  </div>
              )}

              <div className="relative">
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => setShowUserMenu(!showUserMenu)}>
                  <div className="text-right">
                      <p className="font-bold text-sm text-slate-800 leading-tight">{userSession?.name}</p>
                      <p className="text-xs text-blue-600 font-medium">{displayRole}</p>
                  </div>
                  <UserCircle size={32} className="text-slate-300 hover:text-blue-600 transition" />
                </div>

                {showUserMenu && (
                  <div className="absolute top-12 right-0 w-48 bg-white shadow-2xl rounded-xl border border-slate-100 overflow-hidden z-50">
                    <div className="p-2">
                      <button onClick={() => { setShowUserMenu(false); router.push('/settings'); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition text-left">
                        <Settings size={16} /> My Profile
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