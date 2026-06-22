"use client";

import { useState, useEffect } from 'react';
import { ShieldAlert, UserCog, UserMinus, Plus } from 'lucide-react';

export default function StaffPage() {
    const [staff, setStaff] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentUserRole, setCurrentUserRole] = useState('');
    const [clinicId, setClinicId] = useState('');
    const [isEditing, setIsEditing] = useState<string | null>(null);

    const [form, setForm] = useState({
        ic: '', name: '', email: '', is_my: true,
        permissions: { APPOINTMENT_MANAGEMENT: false, BLOOD_TEST_MANAGEMENT: false, VACCINE_MANAGEMENT: false, DOCTOR_MANAGEMENT: false, PATIENT_MANAGEMENT: false, CHAT_SUPPORT: false },
        status: 'active', resign_reason: '', custom_resign_reason: ''
    });

    const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
    const [icParts, setIcParts] = useState(['', '', '']);

    const fetchStaff = async () => {
        const token = localStorage.getItem('aicas_token');
        const userStr = localStorage.getItem('aicas_user');
        if (userStr) {
            const userObj = JSON.parse(userStr);
            setCurrentUserRole(userObj.role);
            setClinicId(userObj.clinic_id);
        }
        try {
            const res = await fetch('http://127.0.0.1:8000/admin/users', { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.status === 401) { window.location.href = '/login'; return; }
            if (res.ok) setStaff(await res.json());
        } catch (err) {}
        setIsLoading(false);
    };

    useEffect(() => { fetchStaff(); }, []);

    const handleICPartChange = (index: number, val: string) => {
        const clean = val.replace(/\D/g, '');
        const newParts = [...icParts]; newParts[index] = clean;
        setIcParts(newParts);
    };

    const handleEdit = (user: any) => {
        setIsEditing(user.ic);
        setStatusMsg({ type: '', text: '' });
        
        const isMy = user.ic.replace(/\D/g, '').length === 12;
        if (isMy) {
            const clean = user.ic.replace(/\D/g, '');
            setIcParts([clean.substring(0,6), clean.substring(6,8), clean.substring(8,12)]);
        } else setIcParts(['', '', '']);

        const permsArray = user.permissions ? user.permissions.split(', ') : [];
        let initialReason = '', customReason = '';
        const defaultReasons = ["Found Better Opportunity", "Relocation", "Personal Reasons", "Career Change", "System Role Replacement"];
        if (user.status === 'resigned' && user.resign_reason) {
            if (defaultReasons.includes(user.resign_reason)) initialReason = user.resign_reason;
            else { initialReason = 'Others'; customReason = user.resign_reason; }
        }

        setForm({
            ic: user.ic, name: user.name, email: user.email, is_my: isMy, status: user.status, resign_reason: initialReason, custom_resign_reason: customReason,
            permissions: {
                APPOINTMENT_MANAGEMENT: permsArray.includes('APPOINTMENT_MANAGEMENT') || permsArray.includes('ALL'),
                BLOOD_TEST_MANAGEMENT: permsArray.includes('BLOOD_TEST_MANAGEMENT') || permsArray.includes('ALL'),
                VACCINE_MANAGEMENT: permsArray.includes('VACCINE_MANAGEMENT') || permsArray.includes('ALL'),
                DOCTOR_MANAGEMENT: permsArray.includes('DOCTOR_MANAGEMENT') || permsArray.includes('ALL'),
                PATIENT_MANAGEMENT: permsArray.includes('PATIENT_MANAGEMENT') || permsArray.includes('ALL'),
                CHAT_SUPPORT: permsArray.includes('CHAT_SUPPORT') || permsArray.includes('ALL'),
            }
        });
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatusMsg({ type: '', text: '' });

        if (!form.name || !form.email) return setStatusMsg({ type: 'error', text: 'All identity fields are required.' });
        
        let finalIC = form.ic.toUpperCase();
        if (!finalIC) return setStatusMsg({ type: 'error', text: 'IC / Passport Number is required.' });

        if (form.is_my) {
            const [p1, p2, p3] = icParts;
            if (p1.length !== 6 || p2.length !== 2 || p3.length !== 4) return setStatusMsg({ type: 'error', text: 'IC must be complete (12 digits).' });
            if (p1 === '000000' || p2 === '00' || p3 === '0000') return setStatusMsg({ type: 'error', text: 'Invalid IC format. 000000, 00, or 0000 are not allowed.' });
            const mm = parseInt(p1.substring(2,4)), dd = parseInt(p1.substring(4,6));
            if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return setStatusMsg({ type: 'error', text: 'Invalid date format in IC.' });
            finalIC = `${p1}-${p2}-${p3}`;
        } else {
            if (!/^[a-zA-Z0-9]+$/.test(finalIC)) return setStatusMsg({ type: 'error', text: 'Passport Number cannot contain symbols.' });
        }
        
        if (form.status === 'resigned' && !form.resign_reason) return setStatusMsg({ type: 'error', text: 'Please provide a reason for resignation.' });
        if (form.status === 'resigned' && form.resign_reason === 'Others' && !form.custom_resign_reason.trim()) return setStatusMsg({ type: 'error', text: 'Please specify the custom resignation reason.' });

        const activePerms = Object.keys(form.permissions).filter((k) => form.permissions[k as keyof typeof form.permissions]);
        const permissionsStr = activePerms.length === 6 ? 'ALL' : activePerms.join(', ');
        const finalResignReason = form.status === 'resigned' ? (form.resign_reason === 'Others' ? form.custom_resign_reason : form.resign_reason) : null;

        const submitPayload = async (isForced = false) => {
            const token = localStorage.getItem('aicas_token');
            const url = isEditing === 'new' ? 'http://127.0.0.1:8000/admin/users' : `http://127.0.0.1:8000/admin/users/${isEditing}`;
            const method = isEditing === 'new' ? 'POST' : 'PUT';

            try {
                const res = await fetch(url, {
                    method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ ic_passport_number: finalIC, name: form.name, email: form.email, status: form.status, permissions: permissionsStr, resign_reason: finalResignReason, clinic_id: clinicId, force_email_update: isForced })
                });

                if (res.status === 401) { window.location.href = '/login'; return; }

                if (res.ok) {
                    setStatusMsg({ type: 'success', text: isEditing === 'new' ? 'Staff added successfully! Details sent via email.' : 'Staff updated successfully! Emails sent if credentials changed.' });
                    setTimeout(() => setIsEditing(null), 2500);
                    fetchStaff();
                } else {
                    const err = await res.json();
                    if (err.detail === "EMAIL_MISMATCH" || err.detail?.includes("EMAIL_MISMATCH")) {
                        if (window.confirm("Are you sure you want to overwrite the email address for this user globally?")) { submitPayload(true); } 
                        else { setStatusMsg({ type: 'error', text: 'Action cancelled.' }); }
                    } else { setStatusMsg({ type: 'error', text: err.detail || 'Failed to save staff.' }); }
                }
            } catch (err) { setStatusMsg({ type: 'error', text: 'Server connection error.' }); }
        };

        submitPayload(false);
    };

    if (isLoading) return <div className="animate-pulse h-64 bg-slate-200 rounded-2xl"></div>;

    if (currentUserRole === 'staff') {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <ShieldAlert size={64} className="text-red-500 mb-6" />
                <h1 className="text-3xl font-black text-slate-800 mb-2">Access Denied</h1>
                <p className="text-slate-500 max-w-md">You do not have the required administrative permissions to view or manage clinic staff.</p>
            </div>
        );
    }

    const pastStaff = staff.filter(s => s.status === 'resigned' || s.status === 'inactive');
    const activeStaff = staff.filter(s => s.status === 'active');

    return (
        <div className="max-w-6xl mx-auto space-y-12">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">Staff Directory</h1>
                    <p className="text-slate-500 mt-1 text-sm">Manage clinic personnel, permissions, and roles.</p>
                </div>
                {!isEditing && (
                    <button onClick={() => { setIsEditing('new'); setStatusMsg({type:'', text:''}); setIcParts(['','','']); setForm({ic:'', name:'', email:'', is_my: true, status: 'active', resign_reason: '', custom_resign_reason: '', permissions: { APPOINTMENT_MANAGEMENT: false, BLOOD_TEST_MANAGEMENT: false, VACCINE_MANAGEMENT: false, DOCTOR_MANAGEMENT: false, PATIENT_MANAGEMENT: false, CHAT_SUPPORT: false }}); }} className="bg-blue-600 text-white font-bold px-6 py-2.5 rounded-xl hover:bg-blue-700 transition shadow-sm flex items-center gap-2">
                        <Plus size={18} /> Add New Staff
                    </button>
                )}
            </div>

            {isEditing && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden mb-12">
                    <div className="bg-slate-50 px-8 py-5 border-b flex justify-between items-center">
                        <h2 className="text-lg font-black text-slate-800">{isEditing === 'new' ? 'Register New Staff Member' : 'Edit Staff Details'}</h2>
                    </div>
                    
                    <form onSubmit={handleSave} className="p-8 space-y-8">
                        {statusMsg.text && ( <div className={`p-4 rounded-xl font-medium ${statusMsg.type === 'error' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}> {statusMsg.text} </div> )}
                        
                        <div>
                            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Identity Details</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex gap-2">
                                    <select value={form.is_my ? "my" : "non_my"} onChange={e => { setForm({...form, is_my: e.target.value === "my", ic: ''}); setIcParts(['','','']); }} className="p-3 border rounded-xl outline-none bg-slate-50 w-1/3">
                                        <option value="my">Malaysian</option><option value="non_my">Non-Malaysian</option>
                                    </select>
                                    {form.is_my ? (
                                        <div className={`flex gap-2 flex-1 items-center bg-slate-50 border rounded-xl px-2 ${isEditing === 'new' ? 'focus-within:ring-2 focus-within:ring-blue-500' : 'opacity-60'}`}>
                                            <input type="text" placeholder="YYMMDD" maxLength={6} value={icParts[0]} onChange={e => handleICPartChange(0, e.target.value)} disabled={isEditing !== 'new'} className="w-[40%] bg-transparent p-2 outline-none font-mono text-center disabled:opacity-100" />
                                            <span className="text-slate-400 font-bold">-</span>
                                            <input type="text" placeholder="XX" maxLength={2} value={icParts[1]} onChange={e => handleICPartChange(1, e.target.value)} disabled={isEditing !== 'new'} className="w-[20%] bg-transparent p-2 outline-none font-mono text-center disabled:opacity-100" />
                                            <span className="text-slate-400 font-bold">-</span>
                                            <input type="text" placeholder="XXXX" maxLength={4} value={icParts[2]} onChange={e => handleICPartChange(2, e.target.value)} disabled={isEditing !== 'new'} className="w-[40%] bg-transparent p-2 outline-none font-mono text-center disabled:opacity-100" />
                                        </div>
                                    ) : (
                                        <input type="text" placeholder="Passport Number" required value={form.ic} onChange={e => setForm({...form, ic: e.target.value})} disabled={isEditing !== 'new'} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 font-mono flex-1 uppercase disabled:opacity-50" />
                                    )}
                                </div>
                                <input type="text" placeholder="Full Name" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 uppercase font-medium text-slate-800" />
                                <input type="email" placeholder="Login Email" required value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 font-medium text-slate-800" />
                                {isEditing !== 'new' && (
                                    <select value={form.status} onChange={e => setForm({...form, status: e.target.value, resign_reason: e.target.value !== 'resigned' ? '' : form.resign_reason})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white font-bold text-slate-700 shadow-sm border-slate-200">
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                        <option value="resigned">Resigned / Archived</option>
                                    </select>
                                )}
                            </div>
                            
                            {form.status === 'resigned' && (
                                <div className="mt-4 animate-in fade-in slide-in-from-top-2 p-4 bg-red-50 border border-red-100 rounded-xl">
                                    <label className="block text-xs font-bold text-red-500 uppercase mb-2">Reason for Resignation</label>
                                    <div className="flex gap-4">
                                        <select value={form.resign_reason} onChange={e => setForm({...form, resign_reason: e.target.value})} required className="flex-1 p-3 border border-red-200 rounded-xl outline-none bg-white font-medium text-slate-700">
                                            <option value="" disabled>Select a reason...</option>
                                            <option value="Found Better Opportunity">Found Better Opportunity</option>
                                            <option value="Relocation">Relocation</option>
                                            <option value="Personal Reasons">Personal Reasons</option>
                                            <option value="Career Change">Career Change</option>
                                            <option value="System Role Replacement">System Role Replacement</option>
                                            <option value="Others">Others (Please specify)</option>
                                        </select>
                                        {form.resign_reason === 'Others' && (
                                            <input type="text" placeholder="Please specify..." value={form.custom_resign_reason} onChange={e => setForm({...form, custom_resign_reason: e.target.value})} required className="flex-1 p-3 border border-red-200 rounded-xl outline-none bg-white font-medium text-slate-700" />
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {form.status !== 'resigned' && (
                            <div className="animate-in fade-in">
                                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Module Permissions</h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {Object.keys(form.permissions).map((key) => (
                                        <label key={key} className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition ${form.permissions[key as keyof typeof form.permissions] ? 'border-blue-500 bg-blue-50/50' : 'bg-white hover:bg-slate-50'}`}>
                                            <input type="checkbox" checked={form.permissions[key as keyof typeof form.permissions]} onChange={(e) => setForm({ ...form, permissions: { ...form.permissions, [key]: e.target.checked } })} className="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                                            <div><div className="font-bold text-slate-800 text-sm">{key.replace(/_/g, ' ')}</div></div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="pt-6 border-t flex justify-end gap-3">
                            <button type="button" onClick={() => { setIsEditing(null); fetchStaff(); }} className="px-8 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition">Cancel</button>
                            <button type="submit" className="bg-blue-600 text-white font-bold px-10 py-3 rounded-xl shadow-lg hover:bg-blue-700 transition">Save Staff Details</button>
                        </div>
                    </form>
                </div>
            )}

            {!isEditing && (
                <>
                    <div>
                        <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2"><UserCog size={20} className="text-blue-600"/> Active Personnel</h2>
                        <div className="grid grid-cols-1 gap-4">
                            {activeStaff.map((s, idx) => (
                                <div key={idx} className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg ${s.role.includes('admin') ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{s.name.charAt(0)}</div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="font-black text-slate-800">{s.name}</h3>
                                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${s.role.includes('admin') ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>{s.role.replace('_', ' ')}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-slate-500 font-medium"><span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{s.ic}</span><span>•</span><span>{s.email}</span></div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex gap-1 flex-wrap justify-end max-w-[200px]">
                                            {s.permissions === 'ALL' ? ( <span className="text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg">Full Access</span> ) : ( s.permissions?.split(', ').map((p: string, i: number) => ( <span key={i} className="text-[9px] font-bold uppercase bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{p.split('_')[0]}</span> )) )}
                                        </div>
                                        {s.role !== 'primary_admin' && s.role !== 'temporary_admin' && (
                                            <button onClick={() => handleEdit(s)} className="bg-slate-100 text-slate-700 font-bold px-4 py-2 rounded-xl text-sm hover:bg-slate-200 transition">Edit</button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {activeStaff.length === 0 && <p className="text-center text-slate-500 py-10 bg-white rounded-2xl border border-slate-200 font-medium">[No staff found]</p>}
                        </div>
                    </div>

                    {pastStaff.length > 0 && (
                        <div className="opacity-75">
                            <h2 className="text-xl font-black text-slate-500 mb-6 flex items-center gap-2"><UserMinus size={20} /> Archived & Resigned Personnel</h2>
                            <div className="grid grid-cols-1 gap-4">
                                {pastStaff.map((s, idx) => (
                                    <div key={idx} className="bg-slate-50 p-5 border border-slate-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 grayscale">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg bg-slate-200 text-slate-400">{s.name.charAt(0)}</div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="font-black text-slate-600 line-through">{s.name}</h3>
                                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700">{s.status}</span>
                                                    {s.status === 'resigned' && s.resign_reason && ( <span className="text-[10px] font-medium text-slate-500 italic">Reason: {s.resign_reason}</span> )}
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-slate-400 font-medium"><span className="font-mono">{s.ic}</span></div>
                                            </div>
                                        </div>
                                        <button onClick={() => handleEdit(s)} className="bg-slate-200 text-slate-500 font-bold px-4 py-2 rounded-xl text-sm hover:bg-slate-300 transition">Restore / Edit</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}