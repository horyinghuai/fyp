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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg({ type: '', text: '' });
    
    try {
      const res = await fetch(`http://127.0.0.1:8000/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      
      if (data.status === 'success') {
        // Successful login
        router.push('/');
      } else {
        setStatusMsg({ type: 'error', text: data.detail || 'Login failed. Check credentials.' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Server error. Please try again.' });
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg({ type: '', text: '' });

    try {
      const res = await fetch(`http://127.0.0.1:8000/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail })
      });
      const data = await res.json();

      if (data.status === 'success') {
        setStatusMsg({ type: 'success', text: 'Verification code sent to your email.' });
        setIsForgotPassword(false);
      } else {
        setStatusMsg({ type: 'error', text: data.detail || 'Failed to send email.' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Server error. Please try again.' });
    }
  };

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
            <button type="submit" className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition duration-200 mt-4">
              Sign In
            </button>
          </form>
        ) : (
          <form onSubmit={handleForgotPassword} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Enter your Email</label>
              <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition bg-slate-50" placeholder="admin@clinic.com" />
            </div>
            <button type="submit" className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl shadow-md hover:bg-emerald-700 transition duration-200">
              Send Verification Code
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