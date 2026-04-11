"use client";

import { useState, useEffect } from 'react';
import { Syringe } from 'lucide-react';

const CLINIC_ID = "c1111111-1111-1111-1111-111111111111";

export default function VaccinesPage() {
  const [vaccines, setVaccines] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  
  const [showModal, setShowModal] = useState(false);
  const [editingVac, setEditingVac] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', type: '', total_doses: 1, price: 0, has_booster: false });

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    fetch(`http://127.0.0.1:8000/vaccines/${CLINIC_ID}`)
      .then(res => res.json())
      .then(data => { setVaccines(data); setIsLoading(false); setError(false); })
      .catch(() => { setIsLoading(false); setError(true); });
  };

  const handleSave = async () => {
    const isEditing = !!editingVac;
    const url = isEditing ? `http://127.0.0.1:8000/admin/vaccines/${editingVac.id}` : `http://127.0.0.1:8000/admin/vaccines`;
    
    await fetch(url, {
      method: isEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinic_id: CLINIC_ID, ...formData })
    });
    
    setShowModal(false);
    loadData();
  };

  const handleDelete = async (id: number) => {
    if(confirm("Delete this Vaccine?")) {
      await fetch(`http://127.0.0.1:8000/admin/vaccines/${id}/${CLINIC_ID}`, { method: 'DELETE' });
      loadData();
    }
  };

  // FIX: Added `: any`
  const openModal = (v: any = null) => {
    setEditingVac(v);
    if(v) setFormData({ name: v.name, type: v.type, total_doses: v.total_doses, price: v.price, has_booster: v.has_booster });
    else setFormData({ name: '', type: '', total_doses: 1, price: 0, has_booster: false });
    setShowModal(true);
  };

  const DoseTimeline = ({ total }: { total: number }) => (
    <div className="flex items-center mt-4">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className="w-6 h-6 rounded-full bg-purple-100 border-2 border-purple-500 flex items-center justify-center text-[10px] font-bold text-purple-700">{i + 1}</div>
          </div>
          {i < total - 1 && <div className="w-8 h-0.5 bg-slate-200 mx-1"></div>}
        </div>
      ))}
    </div>
  );

  if (isLoading) return <div className="animate-pulse h-64 bg-slate-200 rounded-2xl"></div>;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">💉 Vaccine Inventory</h1>
          <p className="text-slate-500 mt-1">Configure parameters for the AI Agent to automate multi-stage scheduling.</p>
        </div>
        <button onClick={() => openModal()} className="px-4 py-2 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 shadow-md">+ Add Vaccine</button>
      </div>
      
      {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-4">⚠️ Cannot connect to backend. Is FastAPI running on 127.0.0.1:8000?</div>}

      <div className="grid grid-cols-2 gap-6">
        {vaccines.map((v) => (
          <div key={v.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 group relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>
            <div className="flex justify-between">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2"><Syringe size={20} className="text-purple-500"/> {v.name}</h3>
                <span className="text-xs bg-slate-100 px-2 py-1 rounded-full mt-2 inline-block text-slate-600">{v.type}</span>
                {v.has_booster && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full mt-2 ml-2 font-bold inline-block">⭐ Booster</span>}
              </div>
              <span className="text-2xl font-black text-emerald-500">RM {v.price}</span>
            </div>
            <div className="mt-4 p-4 bg-slate-50 rounded-xl">
              <DoseTimeline total={v.total_doses} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => openModal(v)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-medium text-sm hover:bg-slate-200 transition">Edit</button>
              <button onClick={() => handleDelete(v.id)} className="px-4 py-2 bg-red-50 text-red-600 rounded-lg font-medium text-sm hover:bg-red-100 transition">Delete</button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl w-[400px] shadow-2xl">
            <h3 className="text-xl font-bold mb-4">{editingVac ? 'Edit Vaccine' : 'Add Vaccine'}</h3>
            <div className="space-y-3">
              <input type="text" placeholder="Vaccine Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-3 border border-slate-200 rounded-lg outline-none focus:border-purple-500" />
              <input type="text" placeholder="Type (e.g., HPV, COVID)" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full p-3 border border-slate-200 rounded-lg outline-none focus:border-purple-500" />
              <input type="number" placeholder="Total Doses" value={formData.total_doses || ''} onChange={e => setFormData({...formData, total_doses: parseInt(e.target.value) || 1})} className="w-full p-3 border border-slate-200 rounded-lg outline-none focus:border-purple-500" />
              <input type="number" placeholder="Price (RM)" value={formData.price || ''} onChange={e => setFormData({...formData, price: parseFloat(e.target.value) || 0})} className="w-full p-3 border border-slate-200 rounded-lg outline-none focus:border-purple-500" />
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mt-2 cursor-pointer bg-slate-50 p-3 rounded-lg border border-slate-200">
                <input type="checkbox" checked={formData.has_booster} onChange={e => setFormData({...formData, has_booster: e.target.checked})} className="w-4 h-4 accent-purple-600" /> Has Booster Stage?
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-medium hover:bg-slate-200 transition">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition">Save Vaccine</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}