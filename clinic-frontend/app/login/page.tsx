"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, ArrowLeft } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);
  
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotStep, setForgotStep] = useState(0); 
  const [forgotEmail, setForgotEmail] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [resetPassword, setResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');

  const buildReqs = (pwd: string, confirm: string) => ({
    length: pwd.length >= 8,
    upper: /[A-Z]/.test(pwd),
    lower: /[a-z]/.test(pwd),
    number: /[0-9]/.test(pwd),
    symbol: /[^A-Za-z0-9]/.test(pwd),
    match: pwd !== '' && pwd === confirm
  });

  const firstLoginReqs = buildReqs(newPassword, confirmNewPassword);
  const isFirstLoginValid = Object.values(firstLoginReqs).every(Boolean);

  const forgotReqs = buildReqs(resetPassword, confirmResetPassword);
  const isForgotValid = Object.values(forgotReqs).every(Boolean);

  useEffect(() => {
      if (resendTimer > 0) {
          const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
          return () => clearTimeout(timer);
      }
  }, [resendTimer]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg({ type: '', text: '' });
    setIsLoading(true);
    
    if (email === 'developer@aicas.com' && password === 'aicasdev2026') {
        setStatusMsg({ type: 'success', text: 'Developer Access Granted.' });
        localStorage.setItem('aicas_token', 'dev-token');
        localStorage.setItem('aicas_user', JSON.stringify({ role: 'developer', name: 'AICAS Developer' }));
        router.push('/developer');
        setIsLoading(false);
        return;
    }

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
      if (!isFirstLoginValid) return;

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

  const handleSendCode = async (e?: React.FormEvent) => {
      if(e) e.preventDefault();
      setIsLoading(true);
      setStatusMsg({ type: '', text: '' });
      try {
          const res = await fetch('http://127.0.0.1:8000/admin/forgot-password', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: forgotEmail })
          });
          if (res.ok) {
              setForgotStep(2);
              setResendTimer(30);
              setStatusMsg({ type: 'success', text: 'Verification code sent to your email.' });
          } else {
              setStatusMsg({ type: 'error', text: 'Failed to request code.' });
          }
      } catch (err) {
          setStatusMsg({ type: 'error', text: 'Server error.' });
      }
      setIsLoading(false);
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);
      setStatusMsg({ type: '', text: '' });
      try {
          const res = await fetch('http://127.0.0.1:8000/admin/verify-code', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: forgotEmail, code: verifyCode })
          });
          if (res.ok) {
              setForgotStep(3);
              setStatusMsg({ type: 'success', text: 'Code verified. Please enter a new password.' });
          } else {
              const err = await res.json();
              setStatusMsg({ type: 'error', text: err.detail || 'Invalid verification code.' });
          }
      } catch (err) {
          setStatusMsg({ type: 'error', text: 'Server error.' });
      }
      setIsLoading(false);
  };

  const handleResetPasswordAction = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isForgotValid) return;
      setIsLoading(true);
      try {
          const res = await fetch('http://127.0.0.1:8000/admin/reset-password', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: forgotEmail, code: verifyCode, new_password: resetPassword })
          });
          if (res.ok) {
              setForgotStep(0);
              setIsForgotPassword(false);
              setStatusMsg({ type: 'success', text: 'Password successfully reset. You can now log in.' });
              setForgotEmail(''); setVerifyCode(''); setResetPassword(''); setConfirmResetPassword('');
          } else {
              const err = await res.json();
              setStatusMsg({ type: 'error', text: err.detail || 'Failed to reset password.' });
          }
      } catch (err) {
          setStatusMsg({ type: 'error', text: 'Server error.' });
      }
      setIsLoading(false);
  };

  const ReqItem = ({ met, text }: { met: boolean, text: string }) => (
    <div className={`flex items-center gap-2 text-xs font-medium ${met ? 'text-emerald-600' : 'text-slate-400'}`}>
        {met ? <CheckCircle2 size={14}/> : <XCircle size={14}/>} {text}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative">
      
      {/* Back to Discovery Button */}
      <button 
          onClick={() => router.push('/discovery')} 
          className="absolute top-8 left-8 text-slate-300 hover:text-white transition flex items-center gap-2 font-bold bg-slate-800 px-5 py-2.5 rounded-xl shadow-md"
      >
          <ArrowLeft size={18}/> Back to Discovery
      </button>

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
                <ReqItem met={firstLoginReqs.length} text="8+ Characters" />
                <ReqItem met={firstLoginReqs.upper} text="Uppercase Letter" />
                <ReqItem met={firstLoginReqs.lower} text="Lowercase Letter" />
                <ReqItem met={firstLoginReqs.number} text="Number" />
                <ReqItem met={firstLoginReqs.symbol} text="Symbol (!@#$%)" />
                <ReqItem met={firstLoginReqs.match} text="Passwords Match" />
             </div>

             <button type="submit" disabled={isLoading || !isFirstLoginValid} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition duration-200 mt-2 disabled:opacity-50">
               {isLoading ? "Updating..." : "Update Password & Login"}
             </button>
           </form>

        ) : forgotStep === 1 ? (
          <form onSubmit={handleSendCode} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Enter your Login Email</label>
              <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition bg-slate-50" placeholder="admin@clinic.com" />
            </div>
            <button type="submit" disabled={isLoading} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition duration-200 disabled:opacity-50">
              {isLoading ? "Sending..." : "Send Verification Code"}
            </button>
            <button type="button" onClick={() => { setForgotStep(0); setIsForgotPassword(false); }} className="w-full py-3 bg-slate-100 text-slate-600 font-bold rounded-xl shadow-sm hover:bg-slate-200 transition duration-200">
              Cancel
            </button>
          </form>

        ) : forgotStep === 2 ? (
          <form onSubmit={handleVerifyCode} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Verification Code</label>
              <input type="text" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} required className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition bg-slate-50 font-mono tracking-widest text-lg text-center" placeholder="123456" />
            </div>
            <button type="submit" disabled={isLoading} className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl shadow-md hover:bg-emerald-700 transition duration-200 disabled:opacity-50">
              {isLoading ? "Verifying..." : "Verify Code"}
            </button>
            <button type="button" onClick={() => handleSendCode()} disabled={resendTimer > 0 || isLoading} className="w-full py-3 bg-slate-100 text-slate-600 font-bold rounded-xl shadow-sm hover:bg-slate-200 transition duration-200 disabled:opacity-50">
              {resendTimer > 0 ? `Resend Code in ${resendTimer}s` : "Resend Code"}
            </button>
          </form>

        ) : forgotStep === 3 ? (
          <form onSubmit={handleResetPasswordAction} className="space-y-4">
             <div>
               <label className="block text-xs font-bold text-slate-500 uppercase mb-1">New Password</label>
               <input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} required className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition bg-slate-50" placeholder="••••••••" />
             </div>
             <div>
               <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Confirm New Password</label>
               <input type="password" value={confirmResetPassword} onChange={e => setConfirmResetPassword(e.target.value)} required className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition bg-slate-50" placeholder="••••••••" />
             </div>

             <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 gap-2">
                <ReqItem met={forgotReqs.length} text="8+ Characters" />
                <ReqItem met={forgotReqs.upper} text="Uppercase Letter" />
                <ReqItem met={forgotReqs.lower} text="Lowercase Letter" />
                <ReqItem met={forgotReqs.number} text="Number" />
                <ReqItem met={forgotReqs.symbol} text="Symbol (!@#$%)" />
                <ReqItem met={forgotReqs.match} text="Passwords Match" />
             </div>

             <button type="submit" disabled={isLoading || !isForgotValid} className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl shadow-md hover:bg-emerald-700 transition duration-200 mt-2 disabled:opacity-50">
               {isLoading ? "Resetting..." : "Confirm & Reset Password"}
             </button>
          </form>

        ) : (
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition bg-slate-50" placeholder="admin@clinic.com" />
            </div>
            <div>
              <div className="flex justify-between items-end mb-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">Password</label>
                <button type="button" onClick={() => { setIsForgotPassword(true); setForgotStep(1); }} className="text-xs font-bold text-blue-600 hover:underline">Forgot Password?</button>
              </div>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition bg-slate-50" placeholder="••••••••" />
            </div>
            <button type="submit" disabled={isLoading} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition duration-200 mt-4 disabled:opacity-50">
              {isLoading ? "Authenticating..." : "Sign In"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}