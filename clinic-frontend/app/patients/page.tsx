"use client";

import { useState, useEffect } from 'react';

const CLINIC_ID = "c1111111-1111-1111-1111-111111111111";

export default function PatientsPage() {
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal States
  const [showModal, setShowModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<any>(null);
  const [formData, setFormData] = useState({ ic: '', name: '', phone: '', gender: 'MALE', nationality: 'MALAYSIA' });

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    fetch(`http://127.0.0.1:8000/admin/patients/${CLINIC_ID}`)
      .then(res => res.json())
      .then(data => { setPatients(data); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  };

  const handleSave = async () => {
    const isEditing = !!editingPatient;
    const url = isEditing ? `http://127.0.0.1:8000/admin/patients/${formData.ic}` : `http://127.0.0.1:8000/register-patient`;
    const payload = isEditing ? { name: formData.name, phone: formData.phone, gender: formData.gender, nationality: formData.nationality } 
                              : { clinic_id: CLINIC_ID, ic_passport_number: formData.ic, name: formData.name, phone: formData.phone, gender: formData.gender, nationality: formData.nationality };

    await fetch(url, {
      method: isEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    setShowModal(false);
    loadData();
  };

  const handleDelete = async (ic: str) => {
    if(confirm("Are you sure you want to delete this patient?")) {
      await fetch(`http://127.0.0.1:8000/admin/patients/${ic}`, { method: 'DELETE' });
      loadData();
    }
  };

  const openModal = (patient = null) => {
    setEditingPatient(patient);
    if(patient) setFormData({ ic: patient.ic_passport_number, name: patient.name, phone: patient.phone, gender: patient.gender, nationality: patient.nationality });
    else setFormData({ ic: '', name: '', phone: '', gender: 'MALE', nationality: 'MALAYSIA' });
    setShowModal(true);
  };

  const filteredPatients = patients.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.ic_passport_number.includes(search));

  if (isLoading) return <div className="animate-pulse h-64 bg-slate-200 rounded-2xl"></div>;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">👥 Patient Directory</h1>
          <p className="text-slate-500 mt-1">View, search, edit, and add new patients.</p>
        </div>
        <div className="flex gap-4">
          <input type="text" placeholder="Search Name or IC..." value={search} onChange={(e) => setSearch(e.target.value)} className="px-4 py-2 border rounded-lg outline-none w-64" />
          <button onClick={() => openModal()} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700">+ Add Patient</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="p-4 font-semibold text-slate-600">Patient Details</th>
              <th className="p-4 font-semibold text-slate-600">IC / Passport</th>
              <th className="p-4 font-semibold text-slate-600">Contact</th>
              <th className="p-4 font-semibold text-slate-600 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPatients.map((p, i) => (
              <tr key={p.ic_passport_number} className={`border-b border-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                <td className="p-4">
                  <div className="font-bold text-slate-800">{p.name}</div>
                  <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full">{p.gender}</span>
                  <span className="text-xs text-slate-500 ml-2">{p.nationality}</span>
                </td>
                <td className="p-4 font-mono text-slate-600">{p.ic_passport_number}</td>
                <td className="p-4 text-slate-600">{p.phone}</td>
                <td className="p-4 text-center space-x-2">
                  <button onClick={() => openModal(p)} className="px-3 py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 font-medium text-sm">Edit</button>
                  <button onClick={() => handleDelete(p.ic_passport_number)} className="px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 font-medium text-sm">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl w-96 shadow-2xl">
            <h3 className="text-xl font-bold mb-4">{editingPatient ? 'Edit Patient' : 'Add New Patient'}</h3>
            <div className="space-y-3">
              <input type="text" placeholder="IC / Passport" disabled={!!editingPatient} value={formData.ic} onChange={e => setFormData({...formData, ic: e.target.value})} className="w-full p-2 border rounded" />
              <input type="text" placeholder="Full Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 border rounded" />
              <input type="text" placeholder="Phone Number" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-2 border rounded" />
              <select value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})} className="w-full p-2 border rounded">
                <option value="MALE">Male</option><option value="FEMALE">Female</option>
              </select>
              <input type="text" placeholder="Nationality" value={formData.nationality} onChange={e => setFormData({...formData, nationality: e.target.value})} className="w-full p-2 border rounded" />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-100 rounded font-medium">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded font-medium">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}