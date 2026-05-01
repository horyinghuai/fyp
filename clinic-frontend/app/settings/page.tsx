"use client";

import { useState, useEffect } from 'react';

export default function SettingsPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [status, setStatus] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
      const userStr = localStorage.getItem('aicas_user');
      if (userStr) {
          const user = JSON.parse(userStr);
          setFormData(f => ({ 
              ...f, 
              name: user.name || '', 
              email: user.email || '' 
          }));
      }
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ type: '', text: '' });

    if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
      return setStatus({ type: 'error', text: 'New passwords do not match.' });
    }

    setIsLoading(true);
    
    const token = localStorage.getItem('aicas_token');
    try {
        const res = await fetch(`http://127.0.0.1:8000/admin/profile`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name: formData.name || '',
                email: formData.email || '',
                password: formData.newPassword || undefined
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            const userStr = localStorage.getItem('aicas_user');
            if(userStr) {
                const user = JSON.parse(userStr);
                user.name = data.name;
                localStorage.setItem('aicas_user', JSON.stringify(user));
            }
            
            setStatus({ type: 'success', text: 'Profile updated successfully.' });
            setFormData(f => ({ ...f, newPassword: '', confirmPassword: '' }));
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
              <input 
                type="email" 
                value={formData.email || ''} 
                onChange={(e) => setFormData({...formData, email: e.target.value})} 
                className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                required
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-6 mt-6">
             <h2 className="text-xl font-bold text-slate-800 mb-4">Change Password</h2>
             <p className="text-sm text-slate-500 mb-6">Leave blank if you do not want to change your password.</p>
             
             <div className="grid grid-cols-2 gap-6">
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
          </div>

          <div className="flex justify-end pt-4">
            <button type="submit" disabled={isLoading} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition disabled:opacity-50">
              {isLoading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}