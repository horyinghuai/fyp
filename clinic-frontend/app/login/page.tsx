"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

// Safely initialize Supabase Client with placeholders to prevent build/runtime crashes
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

    if (supabaseUrl === 'https://placeholder.supabase.co') {
      setStatusMsg({
        type: 'error',
        text: 'Supabase environment variables are missing in .env.local'
      });
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) {
        setStatusMsg({ type: 'error', text: error.message });
      } else if (data.session) {
        // Successful login via Supabase
        router.push('/');
      }
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: 'Authentication error. Please try again.'
      });
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg({ type: '', text: '' });

    if (supabaseUrl === 'https://placeholder.supabase.co') {
      setStatusMsg({
        type: 'error',
        text: 'Supabase environment variables are missing in .env.local'
      });
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        // Redirect user after password reset
        redirectTo: `${window.location.origin}/settings`,
      });

      if (error) {
        setStatusMsg({ type: 'error', text: error.message });
      } else {
        setStatusMsg({
          type: 'success',
          text: 'Password reset instructions sent to your email.'
        });
        setForgotEmail('');
        setIsForgotPassword(false);
      }
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: 'Authentication error. Please try again.'
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-8 relative">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center justify-center gap-2">
            <span className="text-blue-600">⚡</span> AICAS
          </h1>
          <p className="text-slate-500 mt-2 text-sm">
            Secure Admin Portal Authentication
          </p>
        </div>

        {statusMsg.text && (
          <div
            className={`p-3 rounded-lg text-sm font-medium mb-6 ${
              statusMsg.type === 'error'
                ? 'bg-red-100 text-red-700'
                : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            {statusMsg.text}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition bg-slate-50"
              placeholder="admin@clinic.com"
            />
          </div>

          <div>
            <div className="flex justify-between items-end mb-1">
              <label className="block text-xs font-bold text-slate-500 uppercase">
                Password
              </label>
              <button
                type="button"
                onClick={() => setIsForgotPassword(true)}
                className="text-xs font-bold text-blue-600 hover:underline"
              >
                Forgot?
              </button>
            </div>

            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition bg-slate-50"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition duration-200 mt-4"
          >
            Sign In
          </button>
        </form>

        {/* Forgot Password Modal */}
        {isForgotPassword && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-8 relative">
              <button
                type="button"
                onClick={() => setIsForgotPassword(false)}
                className="absolute top-4 right-4 text-slate-500 hover:text-slate-800 text-xl font-bold"
              >
                ×
              </button>

              <h2 className="text-2xl font-black text-slate-800 mb-2 text-center">
                Reset Password
              </h2>

              <p className="text-sm text-slate-500 text-center mb-6">
                Enter your admin email to receive password reset instructions.
              </p>

              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    required
                    className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition bg-slate-50"
                    placeholder="admin@clinic.com"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl shadow-md hover:bg-emerald-700 transition duration-200"
                >
                  Send Password Reset Link
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}