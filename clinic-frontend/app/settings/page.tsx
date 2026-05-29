"use client";

import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

export default function SettingsPage() {
  const [originalEmail, setOriginalEmail] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [status, setStatus] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);

  // Email Modal States
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailPhase, setEmailPhase] = useState<'password' | 'code'>('password');
  const [newEmailTarget, setNewEmailTarget] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [modalError, setModalError] = useState('');

  useEffect(() => {
      const userStr = localStorage.getItem('aicas_user');
      if (userStr) {
          const user = JSON.parse(userStr);
          setFormData(f => ({ 
              ...f, 
              name: user.name || '', 
              email: user.email || '' 
          }));
          setOriginalEmail(user.email || '');
      }
  }, []);

  const reqs = {
    length: formData.newPassword.length >= 8,
    upper: /[A-Z]/.test(formData.newPassword),
    lower: /[a-z]/.test(formData.newPassword),
    number: /[0-9]/.test(formData.newPassword),
    symbol: /[^A-Za-z0-9]/.test(formData.newPassword),
    match: formData.newPassword !== '' && formData.newPassword === formData.confirmPassword
  };
  
  const isPasswordValid = formData.newPassword === '' || Object.values(reqs).every(Boolean);

  const proceedWithUpdate = async (emailAlreadyUpdated: boolean) => {
    setIsLoading(true);
    const token = localStorage.getItem('aicas_token');
    try {
        const payload: any = { name: formData.name || '', email: formData.email || '' };
        if (formData.newPassword) payload.password = formData.newPassword;

        const res = await fetch(`http://127.0.0.1:8000/admin/profile`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            const data = await res.json();
            const userStr = localStorage.getItem('aicas_user');
            if(userStr) {
                const user = JSON.parse(userStr);
                user.name = data.name;
                user.email = formData.email;
                localStorage.setItem('aicas_user', JSON.stringify(user));
            }
            
            setStatus({ type: 'success', text: emailAlreadyUpdated ? 'Email and profile updated successfully!' : 'Profile updated successfully.' });
            setFormData(f => ({ ...f, newPassword: '', confirmPassword: '' }));
            setOriginalEmail(formData.email);
            window.dispatchEvent(new Event('storage'));
        } else {
            const err = await res.json();
            setStatus({ type: 'error', text: err.detail || 'Update failed.' });
        }
    } catch (e) {
        setStatus({ type: 'error', text: 'Server error.' });
    }
    setIsLoading(false);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ type: '', text: '' });

    if (!isPasswordValid) {
      return setStatus({ type: 'error', text: 'Password requirements not met.' });
    }

    await proceedWithUpdate(false);
  };

  const handleRequestEmailChange = async () => {
      setModalError('');
      if (!newEmailTarget || !currentPassword) return setModalError('New email and current password are required.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmailTarget)) return setModalError('Invalid email format.');

      setIsLoading(true);
      const token = localStorage.getItem('aicas_token');
      try {
          const res = await fetch('http://127.0.0.1:8000/admin/request-email-change', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ current_password: currentPassword, new_email: newEmailTarget })
          });
          const data = await res.json();
          if (res.ok) {
              setEmailPhase('code');
          } else {
              setModalError(data.detail || 'Failed to request change.');
          }
      } catch (err) {
          setModalError('Server error. Please try again.');
      }
      setIsLoading(false);
  };

  const handleVerifyEmailChange = async () => {
      setModalError('');
      if (!verifyCode) return setModalError('Verification code is required.');
      
      setIsLoading(true);
      const token = localStorage.getItem('aicas_token');
      try {
          const res = await fetch('http://127.0.0.1:8000/admin/verify-email-change', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ new_email: newEmailTarget, code: verifyCode })
          });
          const data = await res.json();
          if (res.ok) {
              setShowEmailModal(false);
              
              // Update local state and localStorage immediately
              const userStr = localStorage.getItem('aicas_user');
              if(userStr) {
                  const user = JSON.parse(userStr);
                  user.email = newEmailTarget;
                  localStorage.setItem('aicas_user', JSON.stringify(user));
              }
              setFormData(f => ({ ...f, email: newEmailTarget }));
              setOriginalEmail(newEmailTarget);
              setStatus({ type: 'success', text: 'Email successfully updated!' });
              window.dispatchEvent(new Event('storage'));
          } else {
              setModalError(data.detail || 'Invalid or expired code.');
          }
      } catch (err) {
          setModalError('Server error. Please try again.');
      }
      setIsLoading(false);
  };

  const ReqItem = ({ met, text }: { met: boolean, text: string }) => (
    <div className={`flex items-center gap-2 text-xs font-medium ${met ? 'text-emerald-600' : 'text-slate-400'}`}>
        {met ? <CheckCircle2 size={14}/> : <XCircle size={14}/>} {text}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-slate-800 mb-8">My Profile Settings</h1>

      {status.text && (
        <div className={`p-4 rounded-xl mb-6 font-medium ${status.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
          {status.text}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
        <h2 className="text-xl font-bold text-slate-800 mb-6 border-b pb-4">Personal Details</h2>
        
        <form onSubmit={handleUpdate} className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Full Name</label>
              <input 
                type="text" 
                value={formData.name || ''} 
                onChange={(e) => setFormData({...formData, name: e.target.value})} 
                className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 uppercase"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Email Address (Login ID)</label>
              <div className="flex gap-3">
                  <input 
                    type="email" 
                    value={formData.email || ''} 
                    readOnly
                    className="flex-1 p-3 border rounded-xl outline-none bg-slate-100 text-slate-500 cursor-not-allowed"
                  />
                  <button 
                    type="button" 
                    onClick={() => {
                        setShowEmailModal(true);
                        setEmailPhase('password');
                        setNewEmailTarget('');
                        setCurrentPassword('');
                        setVerifyCode('');
                        setModalError('');
                    }}
                    className="px-5 py-3 bg-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-300 transition whitespace-nowrap"
                  >
                      Change Email
                  </button>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-6 mt-6">
             <h2 className="text-xl font-bold text-slate-800 mb-4">Change Password</h2>
             <p className="text-sm text-slate-500 mb-6">Leave blank if you do not want to change your password.</p>
             
             <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">New Password</label>
                  <input 
                    type="password" 
                    placeholder="••••••••"
                    value={formData.newPassword || ''} 
                    onChange={(e) => setFormData({...formData, newPassword: e.target.value})} 
                    className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Confirm New Password</label>
                  <input 
                    type="password" 
                    placeholder="••••••••"
                    value={formData.confirmPassword || ''} 
                    onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})} 
                    className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
             </div>

             {formData.newPassword && (
                 <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-3 gap-3">
                    <ReqItem met={reqs.length} text="8+ Characters" />
                    <ReqItem met={reqs.upper} text="Uppercase Letter" />
                    <ReqItem met={reqs.lower} text="Lowercase Letter" />
                    <ReqItem met={reqs.number} text="Number" />
                    <ReqItem met={reqs.symbol} text="Symbol (!@#$%)" />
                    <ReqItem met={reqs.match} text="Passwords Match" />
                 </div>
             )}
          </div>

          <div className="flex justify-end pt-4 border-t">
            <button type="submit" disabled={isLoading || !isPasswordValid} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition disabled:opacity-50">
              {isLoading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

      {showEmailModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-white p-8 rounded-2xl w-[450px] shadow-2xl">
                <h3 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">Verify Email Change</h3>
                {modalError && (
                    <div className="p-3 rounded-lg mb-4 text-sm font-bold bg-red-100 text-red-700">
                        {modalError}
                    </div>
                )}
                
                {emailPhase === 'password' ? (
                    <>
                        <p className="text-sm text-slate-600 mb-4">To change your email, please enter your new email address and current password.</p>
                        <input 
                            type="email" 
                            placeholder="New Email Address" 
                            value={newEmailTarget} 
                            onChange={e => setNewEmailTarget(e.target.value)} 
                            className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 mb-3" 
                        />
                        <input 
                            type="password" 
                            placeholder="Current Password" 
                            value={currentPassword} 
                            onChange={e => setCurrentPassword(e.target.value)} 
                            className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 mb-6" 
                        />
                        <div className="flex gap-3">
                            <button onClick={() => setShowEmailModal(false)} className="flex-1 bg-slate-100 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-200 transition">Cancel</button>
                            <button onClick={handleRequestEmailChange} disabled={isLoading} className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition disabled:opacity-50">Continue</button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="text-sm text-slate-600 mb-4">A 6-digit verification code has been sent to <strong>{newEmailTarget}</strong>.</p>
                        <input 
                            type="text" 
                            placeholder="------" 
                            value={verifyCode} 
                            onChange={e => setVerifyCode(e.target.value)} 
                            maxLength={6}
                            className="w-full p-4 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 mb-6 font-mono tracking-[1em] text-center text-2xl" 
                        />
                        <div className="flex gap-3">
                            <button onClick={() => setShowEmailModal(false)} className="flex-1 bg-slate-100 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-200 transition">Cancel</button>
                            <button onClick={handleVerifyEmailChange} disabled={isLoading} className="flex-1 bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 transition disabled:opacity-50">Verify & Save</button>
                        </div>
                    </>
                )}
            </div>
        </div>
      )}
    </div>
  );
}