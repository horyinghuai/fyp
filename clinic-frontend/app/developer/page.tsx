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

  // Added to track original emails for confirmation prompt
  const [originalEmails, setOriginalEmails] = useState({ admin: '', temp: '' });

  const fetchClinics = async () => {
      const token = localStorage.getItem('aicas_token');
      try {
          const res = await fetch('http://127.0.0.1:8000/admin/clinics', { headers: { 'Authorization': `Bearer ${token}` } });
          if (res.status === 401) {
              localStorage.removeItem('aicas_token');
              localStorage.removeItem('aicas_user');
              window.location.href = '/login';
              return;
          }
          if (res.ok) setClinics(await res.json());
      } catch (err) {}
      setIsLoading(false);
  };

  useEffect(() => { fetchClinics(); }, []);

  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const checkRegistrationNumberExists = (regNum: string, excludeClinicId?: string) => {
      const trimmedRegNum = regNum.trim().toUpperCase();
      return clinics.some(c => (c.id !== excludeClinicId && (c.registration_number || '').toUpperCase() === trimmedRegNum));
  };

  const formatAndValidatePhone = (phone: string) => {
      if (!phone) return null;
      let cleaned = phone.replace(/[\s-]/g, '');
      if (cleaned.startsWith('+60')) cleaned = cleaned.substring(3);
      else if (cleaned.startsWith('60')) cleaned = cleaned.substring(2);
      else if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
      if (!/^(1[0-9]{8,9}|[2-9][0-9]{7,8})$/.test(cleaned)) return null;
      return `+60${cleaned}`;
  };

  const formatIC = (ic: string) => {
      if (!ic) return '';
      const digitsOnly = ic.replace(/\D/g, '');
      if (digitsOnly.length === 12) return `${digitsOnly.substring(0, 6)}-${digitsOnly.substring(6, 8)}-${digitsOnly.substring(8)}`;
      return ic.toUpperCase();
  };

  const openForm = (clinic: any = null) => {
      setStatusMsg({ type: '', text: '' });
      if (clinic) {
          setIsEditing(clinic.id);
          const adminIsMy = clinic.admin?.ic ? clinic.admin.ic.replace(/\D/g, '').length === 12 : true;
          const tempAdminIsMy = clinic.temp_admin?.ic ? clinic.temp_admin.ic.replace(/\D/g, '').length === 12 : true;
          
          setOriginalEmails({ admin: clinic.admin?.email || '', temp: clinic.temp_admin?.email || '' });

          setDevForm({
              clinic_name: clinic.name || '', registration_number: clinic.registration_number || '', address: clinic.address || '', contact_number: clinic.contact_number || '',
              admin_ic: clinic.admin?.ic || '', admin_name: clinic.admin?.name || '', admin_email: clinic.admin?.email || '', admin_status: clinic.admin?.status || 'active', admin_is_my: adminIsMy,
              temp_admin_ic: clinic.temp_admin?.ic || '', temp_admin_name: clinic.temp_admin?.name || '', temp_admin_email: clinic.temp_admin?.email || '', temp_admin_status: clinic.temp_admin?.status || 'inactive', temp_admin_is_my: tempAdminIsMy
          });
      } else {
          setIsEditing('new');
          setOriginalEmails({ admin: '', temp: '' });
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

      if (!devForm.clinic_name) return setStatusMsg({ type: 'error', text: 'Clinic Name is required.' });
      if (!devForm.registration_number) return setStatusMsg({ type: 'error', text: 'Registration Number is required.' });
      if (checkRegistrationNumberExists(devForm.registration_number, isEditing && isEditing !== 'new' ? isEditing : undefined)) return setStatusMsg({ type: 'error', text: `Registration Number '${devForm.registration_number.toUpperCase()}' already exists.` });
      
      if (!devForm.admin_ic || !devForm.admin_name || !devForm.admin_email || !devForm.temp_admin_ic || !devForm.temp_admin_name || !devForm.temp_admin_email) {
          return setStatusMsg({ type: 'error', text: 'All Primary and Temporary Admin fields are required.' });
      }

      if (devForm.contact_number) {
          const formattedPhone = formatAndValidatePhone(devForm.contact_number);
          if (!formattedPhone) return setStatusMsg({ type: 'error', text: 'Invalid Clinic Phone Format.' });
          devForm.contact_number = formattedPhone;
      }

      if (!validateEmail(devForm.admin_email) || !validateEmail(devForm.temp_admin_email)) return setStatusMsg({ type: 'error', text: 'Invalid Email format.' });

      let finalAdminIC = devForm.admin_ic.toUpperCase(), finalTempAdminIC = devForm.temp_admin_ic.toUpperCase();
      if (devForm.admin_is_my) {
          if (finalAdminIC.replace(/\D/g, '').length !== 12) return setStatusMsg({ type: 'error', text: 'Admin IC must be 12 digits.' });
          finalAdminIC = formatIC(finalAdminIC);
      }
      if (devForm.temp_admin_is_my) {
          if (finalTempAdminIC.replace(/\D/g, '').length !== 12) return setStatusMsg({ type: 'error', text: 'Temp Admin IC must be 12 digits.' });
          finalTempAdminIC = formatIC(finalTempAdminIC);
      }

      // Explicit Email Change Confirmation Check
      if (isEditing !== 'new') {
          const adminEmailChanged = devForm.admin_email !== originalEmails.admin;
          const tempAdminEmailChanged = devForm.temp_admin_ic && devForm.temp_admin_email !== originalEmails.temp;

          if (adminEmailChanged || tempAdminEmailChanged) {
              if (!window.confirm("You are changing an administrator's email address. This will overwrite their email globally, reset their password, and send a new temporary password to the new email. Are you sure you want to proceed?")) {
                  return;
              }
          } else {
              if (!window.confirm(`Are you sure you want to save the clinic details?`)) return;
          }
      } else {
          if (!window.confirm(`Are you sure you want to save the clinic details?`)) return;
      }

      const submitPayload = async (isForced = false) => {
          setIsSubmitting(true);
          const payload = {
              clinic_name: devForm.clinic_name.toUpperCase(), registration_number: devForm.registration_number.toUpperCase(), address: devForm.address.toUpperCase(), contact_number: devForm.contact_number,
              admin_ic: finalAdminIC, admin_name: devForm.admin_name, admin_email: devForm.admin_email, admin_is_my: devForm.admin_is_my, admin_status: devForm.admin_status,
              temp_admin_ic: finalTempAdminIC, temp_admin_name: devForm.temp_admin_name, temp_admin_email: devForm.temp_admin_email, temp_admin_is_my: devForm.temp_admin_is_my, temp_admin_status: devForm.temp_admin_status,
              force_email_update: isForced
          };
          const method = isEditing === 'new' ? 'POST' : 'PUT';
          const url = isEditing === 'new' ? 'http://127.0.0.1:8000/admin/register-clinic' : `http://127.0.0.1:8000/admin/clinics/${isEditing}`;

          try {
              const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('aicas_token')}` }, body: JSON.stringify(payload) });
              if (res.status === 401) { window.location.href = '/login'; return; }
              
              if (res.ok) {
                  fetchClinics();
                  setStatusMsg({ type: 'success', text: isEditing === 'new' ? 'Clinic successfully registered! Emails sent.' : 'Clinic updated successfully! Emails sent if credentials changed.' });
                  setTimeout(() => setIsEditing(null), 2500);
              } else {
                  const err = await res.json();
                  if (err.detail === "EMAIL_MISMATCH" || err.detail?.includes("EMAIL_MISMATCH")) {
                      if (window.confirm("Are you sure you want to overwrite the email address for this user globally? (This will reset their password and send an email notification)")) {
                          submitPayload(true);
                      } else { setStatusMsg({ type: 'error', text: 'Action cancelled.' }); }
                  } else { setStatusMsg({ type: 'error', text: err.detail || 'Failed to save.' }); }
              }
          } catch (err) { setStatusMsg({ type: 'error', text: 'Server Error.' }); }
          setIsSubmitting(false);
      };
      submitPayload(false);
  };

  const handleDeleteClinic = async (id: string) => {
      if(!window.confirm("Are you sure you want to permanently delete this clinic and ALL associated data?")) return;
      try {
          const res = await fetch(`http://127.0.0.1:8000/admin/clinics/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('aicas_token')}` } });
          if (res.status === 401) return window.location.href = '/login';
          fetchClinics();
      } catch (err) { alert("Server error."); }
  };

  if (isLoading) return <div className="animate-pulse h-64 bg-slate-200 rounded-2xl"></div>;

  return (
    <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
             <div>
                 <h1 className="text-3xl font-black text-slate-800 tracking-tight">AICAS Global Provisioning</h1>
                 <p className="text-slate-500 mt-1 text-sm">Manage Active Clinics & Master Admins</p>
             </div>
             {!isEditing && <button onClick={() => openForm()} className="bg-blue-600 text-white font-bold px-6 py-2.5 rounded-xl hover:bg-blue-700 transition">+ Register Clinic</button>}
        </div>

        {isEditing ? (
             <form onSubmit={handleSaveClinic} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 space-y-8 mb-8">
                {statusMsg.text && ( <div className={`p-4 rounded-lg font-medium ${statusMsg.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{statusMsg.text}</div> )}
                <div>
                    <h3 className="font-bold text-lg text-blue-700 mb-4 border-b pb-2">1. Clinic Information</h3>
                    <div className="grid grid-cols-2 gap-6">
                        <div><label className="block text-sm font-semibold mb-2">Clinic Name *</label><input type="text" required value={devForm.clinic_name} onChange={e => setDevForm({...devForm, clinic_name: e.target.value})} className="w-full p-3 border rounded-xl outline-none bg-slate-50 uppercase" /></div>
                        <div><label className="block text-sm font-semibold mb-2">Registration Number *</label><input type="text" required value={devForm.registration_number} onChange={e => setDevForm({...devForm, registration_number: e.target.value})} className="w-full p-3 border rounded-xl outline-none bg-slate-50 uppercase" /></div>
                        <div><label className="block text-sm font-semibold mb-2">Contact Number</label><input type="text" value={devForm.contact_number} onChange={e => setDevForm({...devForm, contact_number: e.target.value})} className="w-full p-3 border rounded-xl outline-none bg-slate-50" /></div>
                        <div><label className="block text-sm font-semibold mb-2">Full Address</label><input type="text" value={devForm.address} onChange={e => setDevForm({...devForm, address: e.target.value})} className="w-full p-3 border rounded-xl outline-none bg-slate-50 uppercase" /></div>
                    </div>
                </div>

                <div>
                    <h3 className="font-bold text-lg text-purple-700 mb-4 border-b pb-2">2. Primary Administrator</h3>
                    <div className={`grid gap-6 ${isEditing === 'new' ? 'grid-cols-4' : 'grid-cols-5'}`}>
                        <div><label className="block text-sm font-semibold mb-2">ID Type *</label><select value={devForm.admin_is_my ? "my" : "non_my"} onChange={e => setDevForm({...devForm, admin_is_my: e.target.value === "my", admin_ic: ''})} className="w-full p-3 border rounded-xl bg-slate-50"><option value="my">Malaysian</option><option value="non_my">Non-Malaysian</option></select></div>
                        <div><label className="block text-sm font-semibold mb-2">{devForm.admin_is_my ? "IC Number" : "Passport Number"} *</label><input type="text" required value={devForm.admin_ic} onChange={e => setDevForm({...devForm, admin_ic: e.target.value})} className="w-full p-3 border rounded-xl outline-none bg-slate-50 uppercase" /></div>
                        <div><label className="block text-sm font-semibold mb-2">Full Name *</label><input type="text" required value={devForm.admin_name} onChange={e => setDevForm({...devForm, admin_name: e.target.value})} className="w-full p-3 border rounded-xl outline-none bg-slate-50 uppercase" /></div>
                        <div><label className="block text-sm font-semibold mb-2">Login Email *</label><input type="email" required value={devForm.admin_email} onChange={e => setDevForm({...devForm, admin_email: e.target.value})} className="w-full p-3 border rounded-xl outline-none bg-slate-50" /></div>
                        {isEditing !== 'new' && ( <div><label className="block text-sm font-semibold mb-2">Status</label><select value={devForm.admin_status} onChange={e => setDevForm({...devForm, admin_status: e.target.value})} className="w-full p-3 border rounded-xl bg-white"><option value="active">Active</option><option value="inactive">Inactive</option></select></div> )}
                    </div>
                </div>

                <div>
                    <h3 className="font-bold text-lg text-emerald-700 mb-4 border-b pb-2">3. Temporary Administrator *</h3>
                    <div className={`grid gap-6 ${isEditing === 'new' ? 'grid-cols-4' : 'grid-cols-5'}`}>
                        <div><label className="block text-sm font-semibold mb-2">ID Type *</label><select value={devForm.temp_admin_is_my ? "my" : "non_my"} onChange={e => setDevForm({...devForm, temp_admin_is_my: e.target.value === "my", temp_admin_ic: ''})} className="w-full p-3 border rounded-xl bg-slate-50"><option value="my">Malaysian</option><option value="non_my">Non-Malaysian</option></select></div>
                        <div><label className="block text-sm font-semibold mb-2">{devForm.temp_admin_is_my ? "IC Number" : "Passport Number"} *</label><input type="text" required value={devForm.temp_admin_ic} onChange={e => setDevForm({...devForm, temp_admin_ic: e.target.value})} className="w-full p-3 border rounded-xl outline-none bg-slate-50 uppercase" /></div>
                        <div><label className="block text-sm font-semibold mb-2">Full Name *</label><input type="text" required value={devForm.temp_admin_name} onChange={e => setDevForm({...devForm, temp_admin_name: e.target.value})} className="w-full p-3 border rounded-xl outline-none bg-slate-50 uppercase" /></div>
                        <div><label className="block text-sm font-semibold mb-2">Login Email *</label><input type="email" required value={devForm.temp_admin_email} onChange={e => setDevForm({...devForm, temp_admin_email: e.target.value})} className="w-full p-3 border rounded-xl outline-none bg-slate-50" /></div>
                        {isEditing !== 'new' && devForm.temp_admin_ic && ( <div><label className="block text-sm font-semibold mb-2">Status</label><select value={devForm.temp_admin_status} onChange={e => setDevForm({...devForm, temp_admin_status: e.target.value})} className="w-full p-3 border rounded-xl bg-white"><option value="active">Active</option><option value="inactive">Inactive</option></select></div> )}
                    </div>
                </div>

                <div className="pt-6 border-t flex justify-end gap-3">
                    <button type="button" onClick={() => { setIsEditing(null); fetchClinics(); }} className="px-8 py-3 bg-slate-100 font-bold rounded-xl hover:bg-slate-200">Cancel</button>
                    <button type="submit" disabled={isSubmitting} className="bg-slate-900 text-white font-bold px-10 py-3 rounded-xl hover:bg-slate-800 disabled:opacity-50"> {isSubmitting ? "Processing..." : "Save Clinic Data"} </button>
                </div>
             </form>
        ) : (
            <div className="grid grid-cols-1 gap-6">
                {clinics.map(c => (
                    <div key={c.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-start">
                        <div>
                            <h3 className="text-xl font-bold text-slate-800 mb-1">{c.name?.toUpperCase()}</h3>
                            <div className="text-sm text-slate-500 mb-4 flex gap-4"><span><strong>Reg No:</strong> {(c.registration_number || 'N/A').toUpperCase()}</span><span><strong>Phone:</strong> {c.contact_number || 'N/A'}</span></div>
                            <div className="flex gap-6">
                                <div className="bg-purple-50 border border-purple-100 p-3 rounded-lg min-w-[200px]">
                                    <div className="flex justify-between items-center mb-1"><p className="text-[10px] font-bold text-purple-400 uppercase">Primary Admin</p><span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${c.admin?.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{c.admin?.status || 'Active'}</span></div>
                                    <p className="font-bold text-slate-700 text-sm">{c.admin?.name || 'Missing'}</p><p className="text-xs text-slate-500 font-mono mt-1">{c.admin?.ic}</p>
                                </div>
                                {c.temp_admin && (
                                    <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg min-w-[200px]">
                                        <div className="flex justify-between items-center mb-1"><p className="text-[10px] font-bold text-emerald-500 uppercase">Temp Admin</p><span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${c.temp_admin.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{c.temp_admin.status}</span></div>
                                        <p className="font-bold text-slate-700 text-sm">{c.temp_admin.name}</p><p className="text-xs text-slate-500 font-mono mt-1">{c.temp_admin.ic}</p>
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