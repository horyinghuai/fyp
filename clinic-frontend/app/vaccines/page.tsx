"use client";

import { useState, useEffect } from 'react';
import { Syringe, Sparkles } from 'lucide-react';

const CLINIC_ID = "c1111111-1111-1111-1111-111111111111";

export default function VaccinesPage() {
  const [vaccines, setVaccines] = useState<any[]>([]);
  const [globalVaccines, setGlobalVaccines] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  
  const [showModal, setShowModal] = useState(false);
  const [editingVac, setEditingVac] = useState<any>(null);
  const [modalMode, setModalMode] = useState<'existing' | 'new'>('existing');
  
  const [formData, setFormData] = useState({ vaccine_id: null, name: '', type: '', total_doses: 1, price: 0, has_booster: false, schedules: [] });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [resClinic, resGlobal] = await Promise.all([
        fetch(`http://127.0.0.1:8000/vaccines/${CLINIC_ID}`), fetch(`http://127.0.0.1:8000/admin/global-vaccines`)
      ]);
      setVaccines(await resClinic.json()); setGlobalVaccines(await resGlobal.json());
      setIsLoading(false); setError(false);
    } catch (e) { setIsLoading(false); setError(true); }
  };

  const handleAIAutoFill = async () => {
    if (!formData.name) return;
    setAiLoading(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/admin/ai/vaccine-schedule`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vaccine_name: formData.name })
      });
      const data = await res.json();
      setFormData({ ...formData, type: data.type || '', total_doses: data.total_doses || 1, has_booster: data.has_booster || false, schedules: data.schedules || [] });
    } catch (e) { console.error(e); }
    setAiLoading(false);
  };

  const handleSave = async () => {
    const isEditing = !!editingVac;
    const url = isEditing ? `http://127.0.0.1:8000/admin/vaccines/${editingVac.id}` : `http://127.0.0.1:8000/admin/vaccines`;
    await fetch(url, { method: isEditing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinic_id: CLINIC_ID, ...formData }) });
    setShowModal(false); loadData();
  };

  const handleDelete = async (id: number) => {
    if(confirm("Remove this vaccine from clinic offerings?")) {
      await fetch(`http://127.0.0.1:8000/admin/vaccines/${id}/${CLINIC_ID}`, { method: 'DELETE' }); loadData();
    }
  };

  const openModal = (v: any = null) => {
    setEditingVac(v);
    if(v) { setModalMode('existing'); setFormData({ vaccine_id: v.id, name: v.name, type: v.type, total_doses: v.total_doses, price: v.price, has_booster: v.has_booster, schedules: [] }); } 
    else { setModalMode('existing'); setFormData({ vaccine_id: null, name: '', type: '', total_doses: 1, price: 0, has_booster: false, schedules: [] }); }
    setShowModal(true);
  };

  const DoseTimeline = ({ total }: { total: number }) => (
    <div>
      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Total Stages</label>
      <div className="flex items-center mt-2">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className="flex items-center">
            <div className="w-6 h-6 rounded-full bg-purple-100 border-2 border-purple-500 flex items-center justify-center text-[10px] font-bold text-purple-700">{i + 1}</div>
            {i < total - 1 && <div className="w-8 h-0.5 bg-slate-200 mx-1"></div>}
          </div>
        ))}
      </div>
    </div>
  );

  if (isLoading) return <div className="animate-pulse h-64 bg-slate-200 rounded-2xl"></div>;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div><h1 className="text-3xl font-bold text-slate-800">💉 Vaccine Inventory</h1></div>
        <button onClick={() => openModal()} className="px-4 py-2 bg-purple-600 text-white rounded-lg font-bold">+ Add Vaccine</button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {vaccines.map((v) => (
          <div key={v.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 group relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>
            <div className="flex justify-between">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2"><Syringe size={20} className="text-purple-500"/> {v.name}</h3>
                <label className="block text-xs font-bold text-slate-400 uppercase mt-2">Type</label>
                <span className="text-sm font-semibold text-slate-700">{v.type}</span>
                {v.has_booster && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full ml-3 font-bold">⭐ Booster</span>}
              </div>
              <div className="text-right">
                 <label className="block text-xs font-bold text-slate-400 uppercase">Price</label>
                 <span className="text-2xl font-black text-emerald-500">RM {v.price}</span>
              </div>
            </div>
            <div className="mt-4 p-4 bg-slate-50 rounded-xl">
              <DoseTimeline total={v.total_doses} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => openModal(v)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium">Edit Pricing</button>
              <button onClick={() => handleDelete(v.id)} className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium">Remove</button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl w-[450px] shadow-2xl">
            <h3 className="text-xl font-bold mb-4 border-b pb-2">{editingVac ? 'Edit Vaccine Pricing' : 'Add Vaccine'}</h3>
            
            {!editingVac && (
              <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-lg">
                <button onClick={() => setModalMode('existing')} className={`flex-1 py-1 text-sm font-bold rounded ${modalMode === 'existing' ? 'bg-white shadow' : 'text-slate-500'}`}>Existing Database</button>
                <button onClick={() => setModalMode('new')} className={`flex-1 py-1 text-sm font-bold rounded ${modalMode === 'new' ? 'bg-white shadow text-purple-600' : 'text-slate-500'}`}>✨ AI Generate</button>
              </div>
            )}

            <div className="space-y-4">
              {modalMode === 'existing' && !editingVac && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Select Vaccine Name</label>
                  <select onChange={e => { const s = globalVaccines.find(g => g.id === parseInt(e.target.value)); if (s) setFormData({...formData, vaccine_id: s.id, name: s.name, type: s.type, total_doses: s.total_doses, has_booster: s.has_booster}); }} className="w-full p-3 border rounded-lg outline-none bg-white">
                    <option value="">-- Choose Vaccine --</option>
                    {globalVaccines.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              )}

              {modalMode === 'new' && !editingVac && (
                <>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">New Vaccine Name</label>
                    <div className="flex gap-2">
                      <input type="text" placeholder="e.g. Hepatitis B" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="flex-1 p-3 border rounded-lg outline-none" />
                      <button onClick={handleAIAutoFill} className="bg-purple-100 text-purple-700 px-3 rounded-lg font-bold">{aiLoading ? "..." : <Sparkles size={20}/>}</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">AI Detected Type</label>
                    <input type="text" readOnly value={formData.type} className="w-full p-3 border bg-slate-50 rounded-lg outline-none" />
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-bold text-slate-700 mb-1">Total Doses</label>
                      <input type="number" readOnly value={formData.total_doses} className="w-full p-3 border bg-slate-50 rounded-lg outline-none" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-bold text-slate-700 mb-1">Booster Requirement</label>
                      <input type="text" readOnly value={formData.has_booster ? "Yes" : "No"} className="w-full p-3 border bg-slate-50 rounded-lg outline-none" />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Clinic Price (RM)</label>
                <input type="number" placeholder="RM Price" value={formData.price || ''} onChange={e => setFormData({...formData, price: parseFloat(e.target.value) || 0})} className="w-full p-3 border rounded-lg outline-none" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-100 rounded-lg font-medium">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium">Save Data</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}