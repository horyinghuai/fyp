"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  
  // Standard Login States
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
  const [generatedDevPasswords, setGeneratedDevPasswords] = useState<any>(null);

  // First Time Login Flow
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

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
        if (data.status === "requires_reset") {
            setIsFirstLogin(true);
            setStatusMsg({ type: 'success', text: 'Temporary password accepted. Please create a new secure password.' });
        } else {
            localStorage.setItem('aicas_token', data.token);
            localStorage.setItem('aicas_user', JSON.stringify(data.user));
            router.push('/');
        }
      } else {
        const err = await res.json();
        setStatusMsg({ type: 'error', text: err.detail || 'Invalid email or password.' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Server connection error. Please ensure backend is running.' });
    }
    setIsLoading(false);
  };

  const handleFirstLoginReset = async (e: React.FormEvent) => {
      e.preventDefault();
      if (newPassword !== confirmNewPassword) {
          return setStatusMsg({ type: 'error', text: 'Passwords do not match.' });
      }
      setIsLoading(true);
      try {
          const res = await fetch('http://127.0.0.1:8000/admin/force-reset', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, temp_password: password, new_password: newPassword })
          });
          if (res.ok) {
              const data = await res.json();
              localStorage.setItem('aicas_token', data.token);
              localStorage.setItem('aicas_user', JSON.stringify(data.user));
              router.push('/');
          } else {
              setStatusMsg({ type: 'error', text: 'Failed to reset password.' });
          }
      } catch (err) {
          setStatusMsg({ type: 'error', text: 'Server connection error.' });
      }
      setIsLoading(false);
  };

  // Developer registers clinic WITHOUT setting passwords - system autosets them
  const handleRegisterClinic = async (e: React.FormEvent) => {
      e.preventDefault();
      setStatusMsg({ type: '', text: '' });
      setIsLoading(true);
      
      const admin_pwd = `tmp_${Math.random().toString(36).slice(-8)}`;
      let temp_admin_pwd = "";
      if (devForm.temp_admin_email) {
          temp_admin_pwd = `tmp_${Math.random().toString(36).slice(-8)}`;
      }

      const finalPayload = {
          ...devForm,
          admin_password: admin_pwd,
          temp_admin_password: temp_admin_pwd || undefined
      };

      try {
          const res = await fetch('http://127.0.0.1:8000/admin/register-clinic', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(finalPayload)
          });
          if (res.ok) {
              setStatusMsg({ type: 'success', text: 'Clinic successfully registered!' });
              setGeneratedDevPasswords({ admin: admin_pwd, temp: temp_admin_pwd });
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
                 <button onClick={() => { setIsDeveloperMode(false); setGeneratedDevPasswords(null); }} className="text-sm font-bold text-slate-500 hover:text-slate-800">Exit Developer Mode</button>
             </div>
             
             {statusMsg.text && (
               <div className={`p-3 rounded-lg text-sm font-medium mb-6 ${statusMsg.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                 {statusMsg.text}
               </div>
             )}

             {generatedDevPasswords ? (
                 <div className="bg-blue-50 border border-blue-200 p-6 rounded-xl">
                     <h3 className="font-bold text-blue-800 mb-2">🎉 Accounts Generated Successfully</h3>
                     <p className="text-sm text-blue-700 mb-4">Please securely share these temporary passwords with the clinic administrators. The system will force them to reset upon their first login.</p>
                     <div className="space-y-3">
                         <div className="p-3 bg-white rounded border border-blue-100 flex justify-between items-center">
                             <span className="font-bold text-slate-700">Primary Admin ({devForm.admin_email})</span>
                             <span className="font-mono bg-slate-100 px-3 py-1 rounded text-red-600 font-bold">{generatedDevPasswords.admin}</span>
                         </div>
                         {generatedDevPasswords.temp && (
                             <div className="p-3 bg-white rounded border border-blue-100 flex justify-between items-center">
                                 <span className="font-bold text-slate-700">Temp Admin ({devForm.temp_admin_email})</span>
                                 <span className="font-mono bg-slate-100 px-3 py-1 rounded text-red-600 font-bold">{generatedDevPasswords.temp}</span>
                             </div>
                         )}
                     </div>
                     <button onClick={() => { setIsDeveloperMode(false); setEmail(''); setPassword(''); setGeneratedDevPasswords(null); setDevForm({ clinic_name: '', registration_number: '', address: '', contact_number: '', admin_ic: '', admin_name: '', admin_email: '', admin_password: '', temp_admin_ic: '', temp_admin_name: '', temp_admin_email: '', temp_admin_password: '' }); }} className="mt-6 bg-blue-600 text-white font-bold px-6 py-2 rounded-lg hover:bg-blue-700">Done</button>
                 </div>
             ) : (
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
                        <div className="grid grid-cols-3 gap-4">
                            <input type="text" placeholder="Admin IC / Passport *" required value={devForm.admin_ic} onChange={e => setDevForm({...devForm, admin_ic: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-slate-50 uppercase" />
                            <input type="text" placeholder="Admin Full Name *" required value={devForm.admin_name} onChange={e => setDevForm({...devForm, admin_name: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-slate-50 uppercase" />
                            <input type="email" placeholder="Admin Login Email *" required value={devForm.admin_email} onChange={e => setDevForm({...devForm, admin_email: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-slate-50" />
                        </div>
                    </div>

                    <div>
                        <h3 className="font-bold text-lg text-emerald-700 mb-3">3. Temporary Administrator (Optional)</h3>
                        <div className="grid grid-cols-3 gap-4">
                            <input type="text" placeholder="Temp Admin IC / Passport" value={devForm.temp_admin_ic} onChange={e => setDevForm({...devForm, temp_admin_ic: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 uppercase" />
                            <input type="text" placeholder="Temp Admin Full Name" value={devForm.temp_admin_name} onChange={e => setDevForm({...devForm, temp_admin_name: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 uppercase" />
                            <input type="email" placeholder="Temp Admin Login Email" value={devForm.temp_admin_email} onChange={e => setDevForm({...devForm, temp_admin_email: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50" />
                        </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex justify-end">
                        <button type="submit" disabled={isLoading} className="bg-slate-900 text-white font-bold px-8 py-3 rounded-xl shadow-xl hover:bg-slate-800 disabled:opacity-50">
                            {isLoading ? "Provisioning System..." : "Register Clinic & Initialize"}
                        </button>
                    </div>
                 </form>
             )}
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

        {isFirstLogin ? (
           <form onSubmit={handleFirstLoginReset} className="space-y-5">
             <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl mb-4 text-sm text-orange-800 font-medium">
                 Since this is your first time logging in with a temporary password, you must create a new secure password to continue.
             </div>
             <div>
               <label className="block text-xs font-bold text-slate-500 uppercase mb-1">New Password</label>
               <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition bg-slate-50" placeholder="••••••••" />
             </div>
             <div>
               <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Confirm New Password</label>
               <input type="password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} required className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition bg-slate-50" placeholder="••••••••" />
             </div>
             <button type="submit" disabled={isLoading} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition duration-200 mt-4 disabled:opacity-50">
               {isLoading ? "Updating..." : "Update Password & Login"}
             </button>
           </form>
        ) : !isForgotPassword ? (
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