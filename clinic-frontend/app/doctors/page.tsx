"use client";

import { useState, useEffect } from 'react';

const CLINIC_ID = "c1111111-1111-1111-1111-111111111111";

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  
  const [editingDoctor, setEditingDoctor] = useState<any>(null);
  const [formData, setFormData] = useState({ ic: '', name: '', gender: 'MALE', specialization: '' });
  
  const [schedules, setSchedules] = useState<any[]>([]);
  const [newSchedule, setNewSchedule] = useState({ day_of_week: 'mon', start_time: '09:00', end_time: '17:00' });

  useEffect(() => { loadDoctors(); }, []);

  const loadDoctors = () => {
    fetch(`http://127.0.0.1:8000/admin/doctors-all/${CLINIC_ID}`)
      .then(res => res.json())
      .then(data => { setDoctors(data); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  };

  // Helper to format IC to XXXXXX-XX-XXXX
  const formatIC = (ic: string) => {
    if (!ic) return '';
    const digitsOnly = ic.replace(/\D/g, '');
    if (digitsOnly.length === 12) {
      return `${digitsOnly.substring(0, 6)}-${digitsOnly.substring(6, 8)}-${digitsOnly.substring(8)}`;
    }
    return ic.toUpperCase();
  };

  const handleSaveDoctor = async () => {
    if (!formData.ic || !formData.name) {
      alert("IC and Name are required.");
      return;
    }

    // Process the name to be uppercase and ensure "DR." prefix
    let processedName = formData.name.trim().toUpperCase();
    if (processedName.startsWith("DR ")) {
      processedName = "DR. " + processedName.substring(3).trim();
    } else if (!processedName.startsWith("DR.")) {
      processedName = "DR. " + processedName;
    }

    const formattedIC = formatIC(formData.ic);
    const isEditing = !!editingDoctor;

    // Confirmation before saving
    if (!window.confirm(isEditing ? `Confirm update details for ${processedName}?` : `Confirm adding new doctor ${processedName}?`)) {
        return;
    }

    const url = isEditing ? `http://127.0.0.1:8000/admin/doctors/${editingDoctor.ic_passport_number}` : `http://127.0.0.1:8000/admin/doctors`;
    
    await fetch(url, {
      method: isEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinic_id: CLINIC_ID, ...formData, name: processedName, ic: formattedIC })
    });

    if (!isEditing) {
      await fetch(`http://127.0.0.1:8000/admin/doctors/${formattedIC}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinic_id: CLINIC_ID, day_of_week: 'mon', start_time: '09:00', end_time: '17:00' })
      });
    }
    
    setShowModal(false);
    loadDoctors();
  };

  const handleRemoveDoctor = async (doc: any) => {
    // Confirmation before removing
    if (!window.confirm(`Are you sure you want to remove ${doc.name.toUpperCase()} from this clinic?`)) return;
    
    const res = await fetch(`http://127.0.0.1:8000/admin/doctors/${doc.ic_passport_number}/availability/${CLINIC_ID}`);
    const docSchedules = await res.json();
    
    for (const s of docSchedules) {
      await fetch(`http://127.0.0.1:8000/admin/doctors/${doc.ic_passport_number}/availability/${CLINIC_ID}/${s.day_of_week}/${s.start_time}`, { 
        method: 'DELETE' 
      });
    }
    loadDoctors();
  };

  const openModal = (doc: any = null) => {
    setEditingDoctor(doc);
    if(doc) {
      setFormData({ ic: doc.ic_passport_number, name: doc.name, gender: doc.gender || 'MALE', specialization: doc.specialization || '' });
    } else {
      setFormData({ ic: '', name: '', gender: 'MALE', specialization: '' });
    }
    setShowModal(true);
  };

  const openScheduleModal = async (doc: any) => {
    setEditingDoctor(doc);
    const res = await fetch(`http://127.0.0.1:8000/admin/doctors/${doc.ic_passport_number}/availability/${CLINIC_ID}`);
    setSchedules(await res.json());
    setShowScheduleModal(true);
  };

  const handleAddSchedule = async () => {
    // Confirmation before adding a schedule
    if (!window.confirm(`Confirm adding this time slot?`)) return;

    await fetch(`http://127.0.0.1:8000/admin/doctors/${editingDoctor.ic_passport_number}/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinic_id: CLINIC_ID, ...newSchedule })
    });
    const res = await fetch(`http://127.0.0.1:8000/admin/doctors/${editingDoctor.ic_passport_number}/availability/${CLINIC_ID}`);
    setSchedules(await res.json());
  };

  const handleDeleteSchedule = async (day: string, start: string) => {
    // Confirmation before deleting a schedule
    if (!window.confirm(`Confirm removing this time slot?`)) return;

    await fetch(`http://127.0.0.1:8000/admin/doctors/${editingDoctor.ic_passport_number}/availability/${CLINIC_ID}/${day}/${start}`, { method: 'DELETE' });
    setSchedules(schedules.filter(s => !(s.day_of_week === day && s.start_time === start)));
  };

  if (isLoading) return <div className="animate-pulse h-64 bg-slate-200 rounded-2xl"></div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-slate-800">🩺 Medical Staff</h1>
        <button onClick={() => openModal()} className="px-5 py-2 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 transition">
          + Add Doctor
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {doctors.map(doc => (
          <div key={doc.ic_passport_number} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">{doc.name.toUpperCase()}</h3>
                  <span className="text-[10px] font-bold bg-slate-100 px-2 py-1 rounded text-slate-600 mt-1 inline-block">{doc.gender}</span>
                </div>
                <button onClick={() => handleRemoveDoctor(doc)} className="text-red-400 hover:text-red-600 transition" title="Remove from Clinic">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
              <p className="text-sm text-slate-500 mb-1"><strong>Specialization:</strong> {doc.specialization || 'General Practitioner'}</p>
              <p className="text-xs text-slate-400 font-mono">{formatIC(doc.ic_passport_number)}</p>
            </div>
            <div className="mt-6 flex gap-2">
              <button onClick={() => openModal(doc)} className="flex-1 py-2 bg-slate-100 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-200 transition">Edit Info</button>
              <button onClick={() => openScheduleModal(doc)} className="flex-1 py-2 bg-emerald-100 text-emerald-700 text-sm font-bold rounded-lg hover:bg-emerald-200 transition">Schedules</button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl w-[400px] shadow-2xl">
            <h3 className="text-xl font-bold mb-4 border-b pb-2">{editingDoctor ? 'Edit Doctor' : 'New Doctor'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">IC / Passport</label>
                <input type="text" value={formData.ic} onChange={e => setFormData({...formData, ic: e.target.value})} disabled={!!editingDoctor} className="w-full p-3 border rounded-lg outline-none bg-slate-50" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Full Name</label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-3 border rounded-lg outline-none bg-slate-50" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Specialization</label>
                <input type="text" value={formData.specialization} onChange={e => setFormData({...formData, specialization: e.target.value})} placeholder="e.g. Cardiologist" className="w-full p-3 border rounded-lg outline-none bg-slate-50" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Gender</label>
                <select value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})} className="w-full p-3 border rounded-lg outline-none bg-white">
                  <option value="MALE">Male</option><option value="FEMALE">Female</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg">Cancel</button>
              <button onClick={handleSaveDoctor} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold">Save Details</button>
            </div>
          </div>
        </div>
      )}

      {showScheduleModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl w-[500px] shadow-2xl">
            <h3 className="text-xl font-bold mb-4 border-b pb-2">Manage Schedule: {editingDoctor?.name.toUpperCase()}</h3>
            
            <div className="bg-slate-50 p-4 rounded-xl mb-4 border border-slate-200">
              <h4 className="text-sm font-bold text-slate-600 mb-2">Add Time Slot</h4>
              <div className="flex gap-2">
                <select value={newSchedule.day_of_week} onChange={e => setNewSchedule({...newSchedule, day_of_week: e.target.value})} className="p-2 border rounded-lg outline-none bg-white text-sm flex-1">
                  <option value="mon">Monday</option><option value="tue">Tuesday</option><option value="wed">Wednesday</option>
                  <option value="thu">Thursday</option><option value="fri">Friday</option><option value="sat">Saturday</option><option value="sun">Sunday</option>
                </select>
                <input type="time" value={newSchedule.start_time} onChange={e => setNewSchedule({...newSchedule, start_time: e.target.value})} className="p-2 border rounded-lg outline-none bg-white text-sm" />
                <span className="self-center font-bold text-slate-400">-</span>
                <input type="time" value={newSchedule.end_time} onChange={e => setNewSchedule({...newSchedule, end_time: e.target.value})} className="p-2 border rounded-lg outline-none bg-white text-sm" />
                <button onClick={handleAddSchedule} className="px-3 bg-blue-600 text-white font-bold rounded-lg text-sm hover:bg-blue-700">+</button>
              </div>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {schedules.map((s, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 bg-white border rounded-lg shadow-sm">
                  <div className="flex items-center gap-4">
                    <span className="uppercase font-bold text-xs w-10 text-blue-600">{s.day_of_week}</span>
                    <span className="text-sm font-medium text-slate-700">{s.start_time} - {s.end_time}</span>
                  </div>
                  <button onClick={() => handleDeleteSchedule(s.day_of_week, s.start_time)} className="text-xs text-red-500 font-bold hover:underline">Remove</button>
                </div>
              ))}
              {schedules.length === 0 && <p className="text-center text-sm text-slate-500 py-4">No schedules configured.</p>}
            </div>

            <div className="mt-6 flex justify-end">
              <button onClick={() => { setShowScheduleModal(false); loadDoctors(); }} className="px-6 py-2 bg-slate-800 text-white rounded-lg font-bold">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}