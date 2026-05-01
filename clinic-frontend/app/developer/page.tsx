"use client";

import { useState } from 'react';

export default function DeveloperPage() {
  const [devForm, setDevForm] = useState({
      clinic_name: '', registration_number: '', address: '', contact_number: '',
      admin_ic: '', admin_name: '', admin_email: '',
      temp_admin_ic: '', temp_admin_name: '', temp_admin_email: ''
  });
  
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [generatedDevPasswords, setGeneratedDevPasswords] = useState<any>(null);

  const handleRegisterClinic = async (e: React.FormEvent) => {
      e.preventDefault();
      setStatusMsg({ type: '', text: '' });
      setIsLoading(true);

      const token = localStorage.getItem('aicas_token');

      try {
          const res = await fetch('http://127.0.0.1:8000/admin/register-clinic', {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}` 
              },
              body: JSON.stringify(devForm)
          });
          
          if (res.ok) {
              const data = await res.json();
              setStatusMsg({ type: 'success', text: 'Clinic successfully registered!' });
              setGeneratedDevPasswords({ admin: data.admin_pwd, temp: data.temp_admin_pwd });
          } else {
              const err = await res.json();
              setStatusMsg({ type: 'error', text: err.detail || 'Registration failed.' });
          }
      } catch (err) {
          setStatusMsg({ type: 'error', text: 'Server connection error.' });
      }
      setIsLoading(false);
  };

  const handleResetForm = () => {
      setGeneratedDevPasswords(null);
      setStatusMsg({ type: '', text: '' });
      setDevForm({ 
          clinic_name: '', registration_number: '', address: '', contact_number: '',
          admin_ic: '', admin_name: '', admin_email: '',
          temp_admin_ic: '', temp_admin_name: '', temp_admin_email: '' 
      });
  };

  return (
    <div className="max-w-4xl mx-auto">
        <div className="mb-8">
             <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                AICAS Global Provisioning
             </h1>
             <p className="text-slate-500 mt-1 text-sm">Register a New Clinic & Administrative Accounts</p>
        </div>
         
        {statusMsg.text && (
           <div className={`p-4 rounded-lg font-medium mb-6 ${statusMsg.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
             {statusMsg.text}
           </div>
        )}

        {generatedDevPasswords ? (
             <div className="bg-white border border-slate-200 p-8 rounded-2xl shadow-sm">
                 <h3 className="font-bold text-2xl text-slate-800 mb-2">🎉 Accounts Generated Successfully</h3>
                 <p className="text-slate-600 mb-6">Please securely share these temporary passwords with the clinic administrators. The system will force them to reset upon their first login.</p>
                 <div className="space-y-4">
                     <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
                         <div>
                             <span className="block text-xs font-bold text-slate-400 uppercase">Primary Admin</span>
                             <span className="font-bold text-slate-700">{devForm.admin_email}</span>
                         </div>
                         <span className="font-mono bg-white px-4 py-2 rounded-lg border text-red-600 font-bold">{generatedDevPasswords.admin}</span>
                     </div>
                     {generatedDevPasswords.temp && (
                         <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
                             <div>
                                 <span className="block text-xs font-bold text-slate-400 uppercase">Temporary Admin</span>
                                 <span className="font-bold text-slate-700">{devForm.temp_admin_email}</span>
                             </div>
                             <span className="font-mono bg-white px-4 py-2 rounded-lg border text-red-600 font-bold">{generatedDevPasswords.temp}</span>
                         </div>
                     )}
                 </div>
                 <button onClick={handleResetForm} className="mt-8 bg-blue-600 text-white font-bold px-8 py-3 rounded-xl hover:bg-blue-700 transition">Register Another Clinic</button>
             </div>
        ) : (
             <form onSubmit={handleRegisterClinic} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 space-y-8">
                <div>
                    <h3 className="font-bold text-lg text-blue-700 mb-4 border-b pb-2">1. Clinic Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <input type="text" placeholder="Clinic Name *" required value={devForm.clinic_name} onChange={e => setDevForm({...devForm, clinic_name: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" />
                        <input type="text" placeholder="Registration Number" value={devForm.registration_number} onChange={e => setDevForm({...devForm, registration_number: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" />
                        <input type="text" placeholder="Contact Number" value={devForm.contact_number} onChange={e => setDevForm({...devForm, contact_number: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" />
                        <input type="text" placeholder="Full Address" value={devForm.address} onChange={e => setDevForm({...devForm, address: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" />
                    </div>
                </div>

                <div>
                    <h3 className="font-bold text-lg text-purple-700 mb-4 border-b pb-2">2. Primary Administrator</h3>
                    <div className="grid grid-cols-3 gap-4">
                        <input type="text" placeholder="IC / Passport *" required value={devForm.admin_ic} onChange={e => setDevForm({...devForm, admin_ic: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-slate-50 uppercase" />
                        <input type="text" placeholder="Full Name *" required value={devForm.admin_name} onChange={e => setDevForm({...devForm, admin_name: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-slate-50 uppercase" />
                        <input type="email" placeholder="Login Email *" required value={devForm.admin_email} onChange={e => setDevForm({...devForm, admin_email: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-slate-50" />
                    </div>
                </div>

                <div>
                    <h3 className="font-bold text-lg text-emerald-700 mb-4 border-b pb-2">3. Temporary Administrator (Optional)</h3>
                    <div className="grid grid-cols-3 gap-4">
                        <input type="text" placeholder="IC / Passport" value={devForm.temp_admin_ic} onChange={e => setDevForm({...devForm, temp_admin_ic: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 uppercase" />
                        <input type="text" placeholder="Full Name" value={devForm.temp_admin_name} onChange={e => setDevForm({...devForm, temp_admin_name: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 uppercase" />
                        <input type="email" placeholder="Login Email" value={devForm.temp_admin_email} onChange={e => setDevForm({...devForm, temp_admin_email: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50" />
                    </div>
                </div>

                <div className="pt-6 border-t flex justify-end">
                    <button type="submit" disabled={isLoading} className="bg-slate-900 text-white font-bold px-10 py-3 rounded-xl shadow-lg hover:bg-slate-800 transition disabled:opacity-50">
                        {isLoading ? "Provisioning System..." : "Register Clinic"}
                    </button>
                </div>
             </form>
        )}
    </div>
  );
}