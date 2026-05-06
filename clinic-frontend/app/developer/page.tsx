"use client";

import { useState, useEffect } from 'react';

export default function DeveloperPage() {
  const [clinics, setClinics] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [devForm, setDevForm] = useState({
      clinic_name: '', registration_number: '', address: '', contact_number: '',
      admin_ic: '', admin_name: '', admin_email: '', admin_is_my: true, admin_status: 'active',
      temp_admin_ic: '', temp_admin_name: '', temp_admin_email: '', temp_admin_is_my: true, temp_admin_status: 'inactive'
  });
  
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedDevPasswords, setGeneratedDevPasswords] = useState<any>(null);

  const fetchClinics = async () => {
      const token = localStorage.getItem('aicas_token');
      try {
          const res = await fetch('http://127.0.0.1:8000/admin/clinics', {
              headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) setClinics(await res.json());
      } catch (err) {}
      setIsLoading(false);
  };

  useEffect(() => { fetchClinics(); }, []);

  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const formatAndValidatePhone = (phone: string) => {
      if(!phone) return null;
      let cleaned = phone.replace(/\s+/g, '');
      if (cleaned.startsWith('0')) cleaned = '+6' + cleaned;
      const phoneRegex = /^\+60\d{1,2}-?\d{7,8}$/;
      if (!phoneRegex.test(cleaned) && !phoneRegex.test(cleaned.replace('-', ''))) return null;
      if (!cleaned.includes('-')) {
          if (cleaned.startsWith('+6011') || cleaned.startsWith('+6015')) cleaned = cleaned.substring(0, 5) + '-' + cleaned.substring(5);
          else cleaned = cleaned.substring(0, 4) + '-' + cleaned.substring(4);
      }
      return cleaned;
  };

  const formatIC = (ic: string) => {
      if (!ic) return '';
      const digitsOnly = ic.replace(/\D/g, '');
      if (digitsOnly.length === 12) return `${digitsOnly.substring(0, 6)}-${digitsOnly.substring(6, 8)}-${digitsOnly.substring(8)}`;
      return ic.toUpperCase();
  };

  const openForm = (clinic: any = null) => {
      setStatusMsg({ type: '', text: '' });
      setGeneratedDevPasswords(null);
      if (clinic) {
          setIsEditing(clinic.id);
          const adminIsMy = clinic.admin?.ic ? clinic.admin.ic.replace(/\D/g, '').length === 12 : true;
          const tempAdminIsMy = clinic.temp_admin?.ic ? clinic.temp_admin.ic.replace(/\D/g, '').length === 12 : true;
          
          setDevForm({
              clinic_name: clinic.name || '',
              registration_number: clinic.registration_number || '',
              address: clinic.address || '',
              contact_number: clinic.contact_number || '',
              admin_ic: clinic.admin?.ic || '',
              admin_name: clinic.admin?.name || '',
              admin_email: clinic.admin?.email || '',
              admin_status: clinic.admin?.status || 'active',
              admin_is_my: adminIsMy,
              temp_admin_ic: clinic.temp_admin?.ic || '',
              temp_admin_name: clinic.temp_admin?.name || '',
              temp_admin_email: clinic.temp_admin?.email || '',
              temp_admin_status: clinic.temp_admin?.status || 'inactive',
              temp_admin_is_my: tempAdminIsMy
          });
      } else {
          setIsEditing('new');
          setDevForm({ 
              clinic_name: '', registration_number: '', address: '', contact_number: '',
              admin_ic: '', admin_name: '', admin_email: '', admin_is_my: true, admin_status: 'active',
              temp_admin_ic: '', temp_admin_name: '', temp_admin_email: '', temp_admin_is_my: true, temp_admin_status: 'inactive'
          });
      }
  };

  const handleSaveClinic = async (e: React.FormEvent) => {
      e.preventDefault();
      setStatusMsg({ type: '', text: '' });

      if (devForm.contact_number) {
          const formattedPhone = formatAndValidatePhone(devForm.contact_number);
          if (!formattedPhone) return setStatusMsg({ type: 'error', text: 'Invalid Clinic Phone Format. Must be +60X-XXXXXXX or 0X-XXXXXXX.' });
          devForm.contact_number = formattedPhone;
      }

      if (!validateEmail(devForm.admin_email)) return setStatusMsg({ type: 'error', text: 'Invalid Admin Email format.' });
      if (devForm.temp_admin_email && !validateEmail(devForm.temp_admin_email)) return setStatusMsg({ type: 'error', text: 'Invalid Temporary Admin Email format.' });

      let finalAdminIC = devForm.admin_ic.toUpperCase();
      if (devForm.admin_is_my) {
          if (finalAdminIC.replace(/\D/g, '').length !== 12) return setStatusMsg({ type: 'error', text: 'Admin IC must be exactly 12 digits for Malaysians.' });
          finalAdminIC = formatIC(finalAdminIC);
      }

      let finalTempAdminIC = devForm.temp_admin_ic.toUpperCase();
      if (devForm.temp_admin_email && devForm.temp_admin_is_my) {
          if (finalTempAdminIC.replace(/\D/g, '').length !== 12) return setStatusMsg({ type: 'error', text: 'Temporary Admin IC must be exactly 12 digits for Malaysians.' });
          finalTempAdminIC = formatIC(finalTempAdminIC);
      }

      if (!window.confirm(`Are you sure you want to save the clinic details?`)) {
          return;
      }

      const payload = {
          ...devForm,
          admin_ic: finalAdminIC,
          temp_admin_ic: finalTempAdminIC
      };

      setIsSubmitting(true);
      const token = localStorage.getItem('aicas_token');
      const method = isEditing === 'new' ? 'POST' : 'PUT';
      const url = isEditing === 'new' ? 'http://127.0.0.1:8000/admin/register-clinic' : `http://127.0.0.1:8000/admin/clinics/${isEditing}`;

      try {
          const res = await fetch(url, {
              method,
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify(payload)
          });
          
          if (res.ok) {
              const data = await res.json();
              fetchClinics();
              if (isEditing === 'new') {
                  setStatusMsg({ type: 'success', text: 'Clinic successfully registered!' });
                  setGeneratedDevPasswords({ admin: data.admin_pwd, temp: data.temp_admin_pwd });
              } else {
                  if (data.admin_pwd || data.temp_admin_pwd) {
                      setStatusMsg({ type: 'success', text: 'Clinic updated. Passwords generated due to credential changes.' });
                      setGeneratedDevPasswords({ admin: data.admin_pwd, temp: data.temp_admin_pwd });
                  } else {
                      setStatusMsg({ type: 'success', text: 'Clinic successfully updated!' });
                      setIsEditing(null);
                  }
              }
          } else {
              const err = await res.json();
              setStatusMsg({ type: 'error', text: err.detail || 'Save failed.' });
          }
      } catch (err) { setStatusMsg({ type: 'error', text: 'Server connection error.' }); }
      setIsSubmitting(false);
  };

  const handleDeleteClinic = async (id: string) => {
      if(!window.confirm("Are you sure you want to permanently delete this clinic and ALL associated data?")) return;
      const token = localStorage.getItem('aicas_token');
      try {
          await fetch(`http://127.0.0.1:8000/admin/clinics/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
          fetchClinics();
      } catch (err) { alert("Server error"); }
  };

  if (isLoading) return <div className="animate-pulse h-64 bg-slate-200 rounded-2xl"></div>;

  return (
    <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
             <div>
                 <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">AICAS Global Provisioning</h1>
                 <p className="text-slate-500 mt-1 text-sm">Manage Active Clinics & Master Admins</p>
             </div>
             {!isEditing && <button onClick={() => openForm()} className="bg-blue-600 text-white font-bold px-6 py-2.5 rounded-xl hover:bg-blue-700 transition">+ Register Clinic</button>}
        </div>

        {isEditing && !generatedDevPasswords ? (
             <form onSubmit={handleSaveClinic} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 space-y-8 mb-8">
                {statusMsg.text && (
                   <div className={`p-4 rounded-lg font-medium ${statusMsg.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                     {statusMsg.text}
                   </div>
                )}
                <div>
                    <h3 className="font-bold text-lg text-blue-700 mb-4 border-b pb-2">1. Clinic Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <input type="text" placeholder="Clinic Name *" required value={devForm.clinic_name} onChange={e => setDevForm({...devForm, clinic_name: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" />
                        <input type="text" placeholder="Registration Number" value={devForm.registration_number} onChange={e => setDevForm({...devForm, registration_number: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" />
                        <input type="text" placeholder="Contact Number (e.g. 012-3456789)" value={devForm.contact_number} onChange={e => setDevForm({...devForm, contact_number: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" />
                        <input type="text" placeholder="Full Address" value={devForm.address} onChange={e => setDevForm({...devForm, address: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" />
                    </div>
                </div>

                <div>
                    <h3 className="font-bold text-lg text-purple-700 mb-4 border-b pb-2">2. Primary Administrator</h3>
                    <div className={`grid gap-4 ${isEditing === 'new' ? 'grid-cols-4' : 'grid-cols-5'}`}>
                        <select value={devForm.admin_is_my ? "my" : "non_my"} onChange={e => setDevForm({...devForm, admin_is_my: e.target.value === "my", admin_ic: ''})} className="p-3 border rounded-xl outline-none bg-slate-50">
                            <option value="my">Malaysian</option><option value="non_my">Non-Malaysian</option>
                        </select>
                        <input type="text" placeholder={devForm.admin_is_my ? "IC Number *" : "Passport Number *"} required value={devForm.admin_ic} onChange={e => setDevForm({...devForm, admin_ic: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-slate-50 uppercase" />
                        <input type="text" placeholder="Full Name *" required value={devForm.admin_name} onChange={e => setDevForm({...devForm, admin_name: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-slate-50 uppercase" />
                        <input type="email" placeholder="Login Email *" required value={devForm.admin_email} onChange={e => setDevForm({...devForm, admin_email: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-slate-50" />
                        {isEditing !== 'new' && (
                            <select value={devForm.admin_status} onChange={e => setDevForm({...devForm, admin_status: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-white shadow-sm font-bold text-slate-700">
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        )}
                    </div>
                </div>

                <div>
                    <h3 className="font-bold text-lg text-emerald-700 mb-4 border-b pb-2">3. Temporary Administrator (Optional)</h3>
                    <div className={`grid gap-4 ${isEditing === 'new' ? 'grid-cols-4' : 'grid-cols-5'}`}>
                        <select value={devForm.temp_admin_is_my ? "my" : "non_my"} onChange={e => setDevForm({...devForm, temp_admin_is_my: e.target.value === "my", temp_admin_ic: ''})} className="p-3 border rounded-xl outline-none bg-slate-50">
                            <option value="my">Malaysian</option><option value="non_my">Non-Malaysian</option>
                        </select>
                        <input type="text" placeholder={devForm.temp_admin_is_my ? "IC Number" : "Passport Number"} value={devForm.temp_admin_ic} onChange={e => setDevForm({...devForm, temp_admin_ic: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 uppercase" />
                        <input type="text" placeholder="Full Name" value={devForm.temp_admin_name} onChange={e => setDevForm({...devForm, temp_admin_name: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 uppercase" />
                        <input type="email" placeholder="Login Email" value={devForm.temp_admin_email} onChange={e => setDevForm({...devForm, temp_admin_email: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50" />
                        {isEditing !== 'new' && devForm.temp_admin_ic && (
                            <select value={devForm.temp_admin_status} onChange={e => setDevForm({...devForm, temp_admin_status: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white shadow-sm font-bold text-slate-700">
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        )}
                    </div>
                </div>

                <div className="pt-6 border-t flex justify-end gap-3">
                    <button type="button" onClick={() => setIsEditing(null)} className="px-8 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200">Cancel</button>
                    <button type="submit" disabled={isSubmitting} className="bg-slate-900 text-white font-bold px-10 py-3 rounded-xl shadow-lg hover:bg-slate-800 transition disabled:opacity-50">
                        {isSubmitting ? "Processing..." : "Save Clinic Data"}
                    </button>
                </div>
             </form>
        ) : generatedDevPasswords ? (
             <div className="bg-white border border-slate-200 p-8 rounded-2xl shadow-sm mb-8">
                 <h3 className="font-bold text-2xl text-slate-800 mb-2">🎉 Credentials Updated/Generated Successfully</h3>
                 <p className="text-slate-600 mb-6">Please securely share these temporary passwords with the clinic administrators. The system will force them to reset upon their first login.</p>
                 <div className="space-y-4">
                     {generatedDevPasswords.admin && (
                         <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
                             <div>
                                 <span className="block text-xs font-bold text-slate-400 uppercase">Primary Admin</span>
                                 <span className="font-bold text-slate-700">{devForm.admin_email}</span>
                             </div>
                             <span className="font-mono bg-white px-4 py-2 rounded-lg border text-red-600 font-bold">{generatedDevPasswords.admin}</span>
                         </div>
                     )}
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
                 <button onClick={() => { setIsEditing(null); setGeneratedDevPasswords(null); }} className="mt-8 bg-blue-600 text-white font-bold px-8 py-3 rounded-xl hover:bg-blue-700 transition">Return to List</button>
             </div>
        ) : (
            <div className="grid grid-cols-1 gap-6">
                {clinics.map(c => (
                    <div key={c.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-start">
                        <div>
                            <h3 className="text-xl font-bold text-slate-800 mb-1">{c.name}</h3>
                            <div className="text-sm text-slate-500 mb-4 flex gap-4">
                                <span><strong>Reg No:</strong> {c.registration_number || 'N/A'}</span>
                                <span><strong>Phone:</strong> {c.contact_number || 'N/A'}</span>
                            </div>
                            <div className="flex gap-6">
                                <div className="bg-purple-50 border border-purple-100 p-3 rounded-lg min-w-[200px]">
                                    <div className="flex justify-between items-center mb-1">
                                        <p className="text-[10px] font-bold text-purple-400 uppercase">Primary Admin</p>
                                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${c.admin?.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                            {c.admin?.status || 'Active'}
                                        </span>
                                    </div>
                                    <p className="font-bold text-slate-700 text-sm">{c.admin?.name || 'Missing'}</p>
                                    <p className="text-xs text-slate-500 font-mono mt-1">{c.admin?.ic}</p>
                                </div>
                                {c.temp_admin && (
                                    <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg min-w-[200px]">
                                        <div className="flex justify-between items-center mb-1">
                                            <p className="text-[10px] font-bold text-emerald-500 uppercase">Temp Admin</p>
                                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${c.temp_admin.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                {c.temp_admin.status}
                                            </span>
                                        </div>
                                        <p className="font-bold text-slate-700 text-sm">{c.temp_admin.name}</p>
                                        <p className="text-xs text-slate-500 font-mono mt-1">{c.temp_admin.ic}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <button onClick={() => openForm(c)} className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-200">Modify Details</button>
                            <button onClick={() => handleDeleteClinic(c.id)} className="px-4 py-2 bg-red-50 text-red-600 text-sm font-bold rounded-lg hover:bg-red-100">Delete Clinic</button>
                        </div>
                    </div>
                ))}
                {clinics.length === 0 && <p className="text-center text-slate-400 py-10">No clinics registered in the system.</p>}
            </div>
        )}
    </div>
  );
}