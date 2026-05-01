"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);
  
  // Developer Mode States
  const [isDeveloperMode, setIsDeveloperMode] = useState(false);
  const [devForm, setDevForm] = useState({
      clinic_name: '', registration_number: '', address: '', contact_number: '',
      admin_ic: '', admin_name: '', admin_email: '', admin_password: '',
      temp_admin_ic: '', temp_admin_name: '', temp_admin_email: '', temp_admin_password: ''
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg({ type: '', text: '' });
    
    if (email === 'developer@aicas.com' && password === 'aicasdev2026') {
        setIsDeveloperMode(true);
        setStatusMsg({ type: 'success', text: 'Developer Access Granted. Register a new Clinic.' });
        return;
    }
    
    setIsLoading(true);
    try {
      const res = await fetch('http://127.0.0.1:8000/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('aicas_token', data.token);
        localStorage.setItem('aicas_user', JSON.stringify(data.user));
        router.push('/');
      } else {
        const err = await res.json();
        setStatusMsg({ type: 'error', text: err.detail || 'Invalid email or password.' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Server connection error. Please ensure backend is running.' });
    }
    setIsLoading(false);
  };

  const handleRegisterClinic = async (e: React.FormEvent) => {
      e.preventDefault();
      setStatusMsg({ type: '', text: '' });
      setIsLoading(true);
      try {
          const res = await fetch('http://127.0.0.1:8000/admin/register-clinic', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(devForm)
          });
          if (res.ok) {
              setStatusMsg({ type: 'success', text: 'Clinic successfully registered! You can now log in with the new Admin account.' });
              setTimeout(() => {
                  setIsDeveloperMode(false);
                  setEmail('');
                  setPassword('');
                  setStatusMsg({ type: '', text: '' });
              }, 3000);
          } else {
              const err = await res.json();
              setStatusMsg({ type: 'error', text: err.detail || 'Registration failed.' });
          }
      } catch (err) {
          setStatusMsg({ type: 'error', text: 'Server connection error.' });
      }
      setIsLoading(false);
  };

  if (isDeveloperMode) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl p-8 overflow-y-auto max-h-[90vh]">
             <div className="flex justify-between items-center mb-6 border-b pb-4">
                 <div>
                     <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                        <span className="text-blue-600">⚡</span> AICAS Developer Portal
                     </h1>
                     <p className="text-slate-500 mt-1 text-sm">Register a New Clinic & Administrative Staff</p>
                 </div>
                 <button onClick={() => setIsDeveloperMode(false)} className="text-sm font-bold text-slate-500 hover:text-slate-800">Exit Developer Mode</button>
             </div>
             
             {statusMsg.text && (
               <div className={`p-3 rounded-lg text-sm font-medium mb-6 ${statusMsg.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                 {statusMsg.text}
               </div>
             )}

             <form onSubmit={handleRegisterClinic} className="space-y-6">
                <div>
                    <h3 className="font-bold text-lg text-blue-700 mb-3">1. Clinic Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <input type="text" placeholder="Clinic Name *" required value={devForm.clinic_name} onChange={e => setDevForm({...devForm, clinic_name: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" />
                        <input type="text" placeholder="Registration Number" value={devForm.registration_number} onChange={e => setDevForm({...devForm, registration_number: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" />
                        <input type="text" placeholder="Contact Number" value={devForm.contact_number} onChange={e => setDevForm({...devForm, contact_number: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" />
                        <input type="text" placeholder="Full Address" value={devForm.address} onChange={e => setDevForm({...devForm, address: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" />
                    </div>
                </div>

                <div>
                    <h3 className="font-bold text-lg text-purple-700 mb-3">2. Primary Administrator</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <input type="text" placeholder="Admin IC / Passport *" required value={devForm.admin_ic} onChange={e => setDevForm({...devForm, admin_ic: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-slate-50" />
                        <input type="text" placeholder="Admin Full Name *" required value={devForm.admin_name} onChange={e => setDevForm({...devForm, admin_name: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-slate-50" />
                        <input type="email" placeholder="Admin Login Email *" required value={devForm.admin_email} onChange={e => setDevForm({...devForm, admin_email: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-slate-50" />
                        <input type="password" placeholder="Admin Initial Password *" required value={devForm.admin_password} onChange={e => setDevForm({...devForm, admin_password: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-slate-50" />
                    </div>
                </div>

                <div>
                    <h3 className="font-bold text-lg text-emerald-700 mb-3">3. Temporary Administrator (Optional)</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <input type="text" placeholder="Temp Admin IC / Passport" value={devForm.temp_admin_ic} onChange={e => setDevForm({...devForm, temp_admin_ic: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50" />
                        <input type="text" placeholder="Temp Admin Full Name" value={devForm.temp_admin_name} onChange={e => setDevForm({...devForm, temp_admin_name: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50" />
                        <input type="email" placeholder="Temp Admin Login Email" value={devForm.temp_admin_email} onChange={e => setDevForm({...devForm, temp_admin_email: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50" />
                        <input type="password" placeholder="Temp Admin Initial Password" value={devForm.temp_admin_password} onChange={e => setDevForm({...devForm, temp_admin_password: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50" />
                    </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end">
                    <button type="submit" disabled={isLoading} className="bg-slate-900 text-white font-bold px-8 py-3 rounded-xl shadow-xl hover:bg-slate-800 disabled:opacity-50">
                        {isLoading ? "Provisioning System..." : "Register Clinic & Initialize"}
                    </button>
                </div>
             </form>
          </div>
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center justify-center gap-2">
            <span className="text-blue-600">⚡</span> AICAS
          </h1>
          <p className="text-slate-500 mt-2 text-sm">Secure Admin Portal Authentication</p>
        </div>

        {statusMsg.text && (
          <div className={`p-3 rounded-lg text-sm font-medium mb-6 ${statusMsg.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {statusMsg.text}
          </div>
        )}

        {!isForgotPassword ? (
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition bg-slate-50" placeholder="admin@clinic.com" />
            </div>
            <div>
              <div className="flex justify-between items-end mb-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">Password</label>
                <button type="button" onClick={() => setIsForgotPassword(true)} className="text-xs font-bold text-blue-600 hover:underline">Forgot?</button>
              </div>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition bg-slate-50" placeholder="••••••••" />
            </div>
            <button type="submit" disabled={isLoading} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition duration-200 mt-4 disabled:opacity-50">
              {isLoading ? "Authenticating..." : "Sign In"}
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); setStatusMsg({ type: 'success', text: 'Please contact the system administrator to reset your local database password.' }); }} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Enter your Email</label>
              <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition bg-slate-50" placeholder="admin@clinic.com" />
            </div>
            <button type="submit" className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl shadow-md hover:bg-emerald-700 transition duration-200">
              Request Help
            </button>
            <button type="button" onClick={() => setIsForgotPassword(false)} className="w-full py-3 bg-slate-100 text-slate-600 font-bold rounded-xl shadow-sm hover:bg-slate-200 transition duration-200">
              Back to Login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}