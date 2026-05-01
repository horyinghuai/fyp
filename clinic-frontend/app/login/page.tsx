"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);
  
  // First Time Login Flow
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Password Requirements
  const reqs = {
    length: newPassword.length >= 8,
    upper: /[A-Z]/.test(newPassword),
    lower: /[a-z]/.test(newPassword),
    number: /[0-9]/.test(newPassword),
    symbol: /[^A-Za-z0-9]/.test(newPassword),
    match: newPassword !== '' && newPassword === confirmNewPassword
  };
  const isPasswordValid = Object.values(reqs).every(Boolean);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg({ type: '', text: '' });
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
            if (data.user.role === 'developer') router.push('/developer');
            else router.push('/');
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
      if (!isPasswordValid) return;

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
              if (data.user.role === 'developer') router.push('/developer');
              else router.push('/');
          } else {
              setStatusMsg({ type: 'error', text: 'Failed to reset password.' });
          }
      } catch (err) {
          setStatusMsg({ type: 'error', text: 'Server connection error.' });
      }
      setIsLoading(false);
  };

  const ReqItem = ({ met, text }: { met: boolean, text: string }) => (
    <div className={`flex items-center gap-2 text-xs font-medium ${met ? 'text-emerald-600' : 'text-slate-400'}`}>
        {met ? <CheckCircle2 size={14}/> : <XCircle size={14}/>} {text}
    </div>
  );

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
           <form onSubmit={handleFirstLoginReset} className="space-y-4">
             <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-800 font-medium">
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

             <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 gap-2">
                <ReqItem met={reqs.length} text="8+ Characters" />
                <ReqItem met={reqs.upper} text="Uppercase Letter" />
                <ReqItem met={reqs.lower} text="Lowercase Letter" />
                <ReqItem met={reqs.number} text="Number" />
                <ReqItem met={reqs.symbol} text="Symbol (!@#$%)" />
                <ReqItem met={reqs.match} text="Passwords Match" />
             </div>

             <button type="submit" disabled={isLoading || !isPasswordValid} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition duration-200 mt-2 disabled:opacity-50">
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