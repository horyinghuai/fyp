"use client";

import { useState, useEffect } from 'react';

// Hardcoded for demo purposes as requested, usually fetched from session
const USER_IC = "admin_ic_placeholder"; 

export default function SettingsPage() {
  const [formData, setFormData] = useState({ email: '', role: '', password: '' });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // In a real flow, you fetch the logged-in user's details here
    fetch(`http://127.0.0.1:8000/admin/users/${USER_IC}`)
      .then(res => res.json())
      .then(data => {
        if(data) setFormData({ email: data.email || '', role: data.role || 'admin', password: '' });
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/admin/users/${USER_IC}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.status === 'success') alert("Profile updated successfully!");
      else alert("Failed to update profile.");
    } catch (e) {
      alert("Server error.");
    }
  };

  if (isLoading) return <div className="animate-pulse h-64 bg-slate-200 rounded-2xl"></div>;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-slate-800 mb-8">⚙️ Account Settings</h1>
      
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
        <h2 className="text-xl font-bold text-slate-800 mb-6 border-b pb-4">Personal Details</h2>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-2">Email Address</label>
            <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-3 border rounded-xl outline-none bg-slate-50 focus:ring-2 focus:ring-blue-500 transition" />
          </div>
          
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-2">System Role</label>
            <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full p-3 border rounded-xl outline-none bg-white focus:ring-2 focus:ring-blue-500 transition">
              <option value="admin">Administrator</option>
              <option value="staff">Staff / Receptionist</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-600 mb-2">Update Password (Leave blank to keep current)</label>
            <input type="password" placeholder="New password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full p-3 border rounded-xl outline-none bg-slate-50 focus:ring-2 focus:ring-blue-500 transition" />
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button onClick={handleSave} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-md">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}