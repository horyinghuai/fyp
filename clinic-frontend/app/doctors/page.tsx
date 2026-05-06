"use client";

import { useState, useEffect } from 'react';
import { Calendar, Trash2, Edit, Plus, Users, Search, ActivitySquare, ChevronDown, ChevronUp, UserMinus, XCircle } from 'lucide-react';

export default function DoctorsPage() {
    const [doctors, setDoctors] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [clinicId, setClinicId] = useState<string>('');
    const [currentUserRole, setCurrentUserRole] = useState('');

    const [isEditing, setIsEditing] = useState<string | null>(null);
    const [form, setForm] = useState({ 
        ic: '', name: '', gender: 'MALE', 
        status: 'active', resign_reason: '', custom_resign_reason: '' 
    });
    
    // Checkbox specializations logic
    const PRESET_SPECIALIZATIONS = ["General Practitioner", "Pediatrician", "Internal Medicine", "Dermatologist", "Cardiologist", "Gynecologist", "Orthopedic"];
    const [selectedSpecs, setSelectedSpecs] = useState<string[]>([]);
    const [isOthersSpec, setIsOthersSpec] = useState(false);
    const [customSpec, setCustomSpec] = useState('');

    const [availForm, setAvailForm] = useState({ ic: '', docName: '', day: 'mon', start: '09:00', end: '17:00' });
    const [isAvailModalOpen, setIsAvailModalOpen] = useState(false);
    const [selectedDocAvail, setSelectedDocAvail] = useState<any[]>([]);
    const [isFetchingAvail, setIsFetchingAvail] = useState(false);

    useEffect(() => {
        const userStr = localStorage.getItem('aicas_user');
        if (userStr) {
            const user = JSON.parse(userStr);
            setClinicId(user.clinic_id);
            setCurrentUserRole(user.role);
            fetchDoctors(user.clinic_id);
        }
    }, []);

    const fetchDoctors = async (cid: string) => {
        setIsLoading(true);
        const token = localStorage.getItem('aicas_token');
        try {
            const res = await fetch(`http://127.0.0.1:8000/admin/doctors-all/${cid}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setDoctors(await res.json());
        } catch (err) {}
        setIsLoading(false);
    };

    const handleEdit = (doc: any) => {
        setIsEditing(doc.ic_passport_number);
        
        let initResign = '';
        let initCustomResign = '';
        if (doc.status === 'resigned' && doc.resign_reason) {
            const defaultReasons = ["Found Better Opportunity", "Relocation", "Personal Reasons", "Career Change", "Retired"];
            if (defaultReasons.includes(doc.resign_reason)) initResign = doc.resign_reason;
            else { initResign = 'Others'; initCustomResign = doc.resign_reason; }
        }

        setForm({
            ic: doc.ic_passport_number,
            name: doc.name,
            gender: doc.gender,
            status: doc.status || 'active',
            resign_reason: initResign,
            custom_resign_reason: initCustomResign
        });

        // Parse specializations
        const specs = doc.specialization ? doc.specialization.split(', ') : [];
        const presetMatched = specs.filter((s: string) => PRESET_SPECIALIZATIONS.includes(s));
        const customFound = specs.find((s: string) => !PRESET_SPECIALIZATIONS.includes(s));
        
        setSelectedSpecs(presetMatched);
        if (customFound) {
            setIsOthersSpec(true);
            setCustomSpec(customFound);
        } else {
            setIsOthersSpec(false);
            setCustomSpec('');
        }
    };

    const handleSpecChange = (spec: string) => {
        if (selectedSpecs.includes(spec)) {
            setSelectedSpecs(selectedSpecs.filter(s => s !== spec));
        } else {
            setSelectedSpecs([...selectedSpecs, spec]);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (form.status === 'resigned' && !form.resign_reason) return alert('Please provide a reason for resignation.');
        if (form.status === 'resigned' && form.resign_reason === 'Others' && !form.custom_resign_reason.trim()) return alert('Please specify the custom resignation reason.');

        let finalSpecs = [...selectedSpecs];
        if (isOthersSpec && customSpec.trim()) {
            finalSpecs.push(customSpec.trim());
        }
        
        if (finalSpecs.length === 0) return alert("Please select at least one specialization.");

        const finalResignReason = form.status === 'resigned' 
            ? (form.resign_reason === 'Others' ? form.custom_resign_reason : form.resign_reason)
            : null;

        const payload = {
            clinic_id: clinicId,
            ic: form.ic.toUpperCase(),
            name: form.name.toUpperCase(),
            gender: form.gender.toUpperCase(),
            specialization: finalSpecs.join(', '),
            status: form.status,
            resign_reason: finalResignReason
        };

        const token = localStorage.getItem('aicas_token');
        const url = isEditing === 'new' ? 'http://127.0.0.1:8000/admin/doctors' : `http://127.0.0.1:8000/admin/doctors/${isEditing}`;
        const method = isEditing === 'new' ? 'POST' : 'PUT';

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                setIsEditing(null);
                fetchDoctors(clinicId);
            }
        } catch (err) {}
    };

    const openAvailModal = async (doc: any) => {
        setAvailForm({ ic: doc.ic_passport_number, docName: doc.name, day: 'mon', start: '09:00', end: '17:00' });
        setIsAvailModalOpen(true);
        fetchAvail(doc.ic_passport_number);
    };

    const fetchAvail = async (ic: string) => {
        setIsFetchingAvail(true);
        const token = localStorage.getItem('aicas_token');
        try {
            const res = await fetch(`http://127.0.0.1:8000/admin/doctors/${ic}/availability/${clinicId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setSelectedDocAvail(await res.json());
        } catch (err) {}
        setIsFetchingAvail(false);
    };

    const handleSaveAvail = async (e: React.FormEvent) => {
        e.preventDefault();
        const token = localStorage.getItem('aicas_token');
        try {
            const res = await fetch(`http://127.0.0.1:8000/admin/doctors/${availForm.ic}/availability`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ clinic_id: clinicId, day_of_week: availForm.day, start_time: availForm.start, end_time: availForm.end })
            });
            if (res.ok) fetchAvail(availForm.ic);
        } catch (err) {}
    };

    const handleDeleteAvail = async (day: string, time: string) => {
        const token = localStorage.getItem('aicas_token');
        try {
            await fetch(`http://127.0.0.1:8000/admin/doctors/${availForm.ic}/availability/${clinicId}/${day}/${time}`, {
                method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
            });
            fetchAvail(availForm.ic);
        } catch (err) {}
    };

    if (isLoading) return <div className="animate-pulse h-64 bg-slate-200 rounded-2xl"></div>;

    const activeDocs = doctors.filter(d => !d.status || d.status === 'active');
    const pastDocs = doctors.filter(d => d.status === 'inactive' || d.status === 'resigned');

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">Doctors</h1>
                    <p className="text-slate-500 mt-1 text-sm">Manage doctors, specializations, and clinic schedules.</p>
                </div>
                {!isEditing && (
                    <button onClick={() => { setIsEditing('new'); setForm({ic:'', name:'', gender:'MALE', status: 'active', resign_reason:'', custom_resign_reason:''}); setSelectedSpecs([]); setIsOthersSpec(false); setCustomSpec(''); }} className="bg-blue-600 text-white font-bold px-6 py-2.5 rounded-xl hover:bg-blue-700 transition shadow-sm flex items-center gap-2">
                        <Plus size={18} /> Add Doctor
                    </button>
                )}
            </div>

            {isEditing && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden mb-12">
                    <div className="bg-slate-50 px-8 py-5 border-b flex justify-between items-center">
                        <h2 className="text-lg font-black text-slate-800">{isEditing === 'new' ? 'Register New Doctor' : 'Edit Provider Details'}</h2>
                    </div>
                    <form onSubmit={handleSave} className="p-8 space-y-8">
                        <div>
                            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Identity</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <input type="text" placeholder="IC / Passport Number *" required disabled={isEditing !== 'new'} value={form.ic} onChange={e => setForm({...form, ic: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 uppercase font-mono disabled:opacity-50" />
                                <input type="text" placeholder="Full Name (With Dr.) *" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="col-span-2 p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 uppercase font-medium" />
                                <select value={form.gender} onChange={e => setForm({...form, gender: e.target.value})} className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 font-medium">
                                    <option value="MALE">MALE</option>
                                    <option value="FEMALE">FEMALE</option>
                                </select>
                            </div>
                        </div>

                        {isEditing !== 'new' && (
                            <div className="animate-in fade-in">
                                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Account Status</h3>
                                <select value={form.status} onChange={e => setForm({...form, status: e.target.value, resign_reason: e.target.value !== 'resigned' ? '' : form.resign_reason})} className="w-1/3 p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white font-bold text-slate-700 shadow-sm border-slate-200">
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                    <option value="resigned">Resigned / Archived</option>
                                </select>

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
                                                <option value="Retired">Retired</option>
                                                <option value="Others">Others (Please specify)</option>
                                            </select>
                                            {form.resign_reason === 'Others' && (
                                                <input type="text" placeholder="Please specify..." value={form.custom_resign_reason} onChange={e => setForm({...form, custom_resign_reason: e.target.value})} required className="flex-1 p-3 border border-red-200 rounded-xl outline-none bg-white font-medium text-slate-700" />
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {form.status !== 'resigned' && (
                            <div className="animate-in fade-in">
                                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Specialization</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {PRESET_SPECIALIZATIONS.map(spec => (
                                        <label key={spec} className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition ${selectedSpecs.includes(spec) ? 'border-blue-500 bg-blue-50' : 'bg-slate-50 hover:bg-slate-100'}`}>
                                            <input type="checkbox" checked={selectedSpecs.includes(spec)} onChange={() => handleSpecChange(spec)} className="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300" />
                                            <span className="font-bold text-slate-700 text-sm">{spec}</span>
                                        </label>
                                    ))}
                                    
                                    <label className={`flex flex-col gap-2 p-3 border rounded-xl cursor-pointer transition ${isOthersSpec ? 'border-blue-500 bg-blue-50' : 'bg-slate-50 hover:bg-slate-100'} col-span-2 md:col-span-4 lg:col-span-2`}>
                                        <div className="flex items-center gap-3">
                                            <input type="checkbox" checked={isOthersSpec} onChange={(e) => setIsOthersSpec(e.target.checked)} className="w-4 h-4 text-blue-600 rounded border-gray-300" />
                                            <span className="font-bold text-slate-700 text-sm">OTHERS</span>
                                        </div>
                                        {isOthersSpec && (
                                            <input type="text" placeholder="Specify specialization..." value={customSpec} onChange={e => setCustomSpec(e.target.value)} required className="p-2 border rounded-lg outline-none bg-white text-sm" />
                                        )}
                                    </label>
                                </div>
                            </div>
                        )}

                        <div className="pt-6 border-t flex justify-end gap-3">
                            <button type="button" onClick={() => setIsEditing(null)} className="px-8 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition">Cancel</button>
                            <button type="submit" className="bg-blue-600 text-white font-bold px-10 py-3 rounded-xl shadow-lg hover:bg-blue-700 transition">
                                {isEditing === 'new' ? "Register Doctor" : "Save Changes"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {!isEditing && (
                <>
                <div>
                    <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
                        <ActivitySquare size={20} className="text-blue-600"/> Active Doctors
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeDocs.map(d => (
                            <div key={d.ic_passport_number} className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition">
                                <div className="flex items-start gap-4 mb-4">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-lg ${d.gender === 'FEMALE' ? 'bg-pink-100 text-pink-600' : 'bg-blue-100 text-blue-600'}`}>
                                        {d.name.replace('DR. ', '').charAt(0)}
                                    </div>
                                    <div>
                                        <h3 className="font-black text-slate-800 text-lg leading-tight">{d.name}</h3>
                                        <p className="text-xs font-mono text-slate-400 mt-1">{d.ic_passport_number}</p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2 mb-6">
                                    {d.specialization?.split(', ').map((spec: string, i: number) => (
                                        <span key={i} className="text-[10px] font-bold uppercase bg-slate-100 text-slate-600 px-2 py-1 rounded-lg border border-slate-200">{spec}</span>
                                    ))}
                                </div>
                                <div className="flex gap-2 mt-auto pt-4 border-t border-slate-100">
                                    <button onClick={() => openAvailModal(d)} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 text-sm font-bold rounded-xl hover:bg-indigo-100 transition">
                                        <Calendar size={16}/> Schedule
                                    </button>
                                    <button onClick={() => handleEdit(d)} className="flex items-center justify-center px-4 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition">
                                        <Edit size={16}/>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {pastDocs.length > 0 && (
                <div className="opacity-75 pt-8">
                    <h2 className="text-xl font-black text-slate-500 mb-6 flex items-center gap-2">
                        <UserMinus size={20} /> Inactive & Resigned Doctors
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pastDocs.map(d => (
                            <div key={d.ic_passport_number} className="bg-slate-50 p-5 border border-slate-200 rounded-2xl flex flex-col justify-between grayscale">
                                <div className="flex items-start gap-4 mb-4">
                                    <div className="w-12 h-12 rounded-full flex items-center justify-center font-black text-lg bg-slate-200 text-slate-500">
                                        {d.name.replace('DR. ', '').charAt(0)}
                                    </div>
                                    <div>
                                        <h3 className="font-black text-slate-600 text-lg leading-tight line-through">{d.name}</h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                                {d.status}
                                            </span>
                                            {d.status === 'resigned' && d.resign_reason && (
                                                <span className="text-[10px] font-medium text-slate-500 italic">
                                                    Reason: {d.resign_reason}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => handleEdit(d)} className="mt-2 w-full py-2 bg-slate-200 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-300 transition">
                                    Restore / Edit
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
                )}
                </>
            )}

            {isAvailModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b bg-slate-50 flex justify-between items-center">
                            <div>
                                <h3 className="font-black text-xl text-slate-800">{availForm.docName}</h3>
                                <p className="text-sm text-slate-500 font-medium">Availability Management</p>
                            </div>
                            <button onClick={() => setIsAvailModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 transition"><XCircle size={18}/></button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1">
                            <form onSubmit={handleSaveAvail} className="bg-indigo-50 border border-indigo-100 p-5 rounded-2xl mb-8">
                                <h4 className="text-xs font-black text-indigo-800 uppercase tracking-widest mb-3">Add Time Slot</h4>
                                <div className="grid grid-cols-3 gap-3 mb-4">
                                    <select value={availForm.day} onChange={e => setAvailForm({...availForm, day: e.target.value})} className="p-2.5 border border-indigo-200 rounded-xl outline-none font-bold text-indigo-900 bg-white">
                                        <option value="mon">Mon</option><option value="tue">Tue</option><option value="wed">Wed</option>
                                        <option value="thu">Thu</option><option value="fri">Fri</option><option value="sat">Sat</option><option value="sun">Sun</option>
                                    </select>
                                    <input type="time" required value={availForm.start} onChange={e => setAvailForm({...availForm, start: e.target.value})} className="p-2.5 border border-indigo-200 rounded-xl outline-none font-bold text-indigo-900 bg-white" />
                                    <input type="time" required value={availForm.end} onChange={e => setAvailForm({...availForm, end: e.target.value})} className="p-2.5 border border-indigo-200 rounded-xl outline-none font-bold text-indigo-900 bg-white" />
                                </div>
                                <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-2.5 rounded-xl hover:bg-indigo-700 transition shadow-sm">
                                    Add Schedule block
                                </button>
                            </form>

                            <div>
                                <h4 className="text-sm font-black text-slate-800 mb-4">Current Schedule</h4>
                                {isFetchingAvail ? (
                                    <div className="animate-pulse flex gap-2"><div className="h-10 bg-slate-200 rounded-xl w-full"></div></div>
                                ) : selectedDocAvail.length > 0 ? (
                                    <div className="space-y-2">
                                        {selectedDocAvail.map((a, i) => (
                                            <div key={i} className="flex justify-between items-center bg-white border border-slate-200 p-3 rounded-xl shadow-sm hover:border-blue-300 transition">
                                                <div className="flex items-center gap-3">
                                                    <span className="w-10 text-center font-black text-blue-700 uppercase text-sm bg-blue-50 py-1 rounded-lg">{a.day_of_week}</span>
                                                    <span className="font-medium text-slate-600 text-sm">{a.start_time} - {a.end_time}</span>
                                                </div>
                                                <button onClick={() => handleDeleteAvail(a.day_of_week, a.start_time)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition"><Trash2 size={16}/></button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-center text-slate-400 py-6 border border-dashed rounded-xl bg-slate-50">No schedule blocks defined.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}