"use client";

import { useState, useEffect } from 'react';
import { Syringe, Sparkles, AlertCircle } from 'lucide-react';

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
  const [formData, setFormData] = useState({ 
    vaccine_id: null, name: '', type: '', total_doses: 1, price: 0, has_booster: false, schedules: [] 
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [resClinic, resGlobal] = await Promise.all([
        fetch(`http://127.0.0.1:8000/vaccines/${CLINIC_ID}`),
        fetch(`http://127.0.0.1:8000/admin/global-vaccines`)
      ]);
      setVaccines(await resClinic.json());
      setGlobalVaccines(await resGlobal.json());
      setIsLoading(false);
      setError(false);
    } catch (e) {
      setIsLoading(false);
      setError(true);
    }
  };

  const handleAIAutoFill = async () => {
    if (!formData.name) return;
    setAiLoading(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/admin/ai/vaccine-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaccine_name: formData.name })
      });
      const data = await res.json();
      setFormData({
        ...formData,
        type: data.type || '',
        total_doses: data.total_doses || 1,
        has_booster: data.has_booster || false,
        schedules: data.schedules || []
      });
    } catch (e) { console.error("AI Error", e); }
    setAiLoading(false);
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
    if(confirm("Remove this vaccine from clinic offerings?")) {
      await fetch(`http://127.0.0.1:8000/admin/vaccines/${id}/${CLINIC_ID}`, { method: 'DELETE' });
      loadData();
    }
  };

  const openModal = (v: any = null) => {
    setEditingVac(v);
    if(v) {
      setModalMode('existing');
      setFormData({ vaccine_id: v.id, name: v.name, type: v.type, total_doses: v.total_doses, price: v.price, has_booster: v.has_booster, schedules: [] });
    } else {
      setModalMode('existing');
      setFormData({ vaccine_id: null, name: '', type: '', total_doses: 1, price: 0, has_booster: false, schedules: [] });
    }
    setShowModal(true);
  };

  const DoseTimeline = ({ total }: { total: number }) => (
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">AI Scheduling Sequence</p>
      <div className="flex items-center mt-2">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className="w-6 h-6 rounded-full bg-purple-100 border-2 border-purple-500 flex items-center justify-center text-[10px] font-bold text-purple-700">{i + 1}</div>
            </div>
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
        <div>
          <h1 className="text-3xl font-bold text-slate-800">💉 Vaccine Inventory</h1>
          <p className="text-slate-500 mt-1">Configure AI logic or add existing database vaccines.</p>
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
              <button onClick={() => openModal(v)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-medium text-sm hover:bg-slate-200">Edit Price</button>
              <button onClick={() => handleDelete(v.id)} className="px-4 py-2 bg-red-50 text-red-600 rounded-lg font-medium text-sm hover:bg-red-100">Remove</button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl w-[450px] shadow-2xl">
            <h3 className="text-xl font-bold mb-4">{editingVac ? 'Edit Vaccine Pricing' : 'Add Vaccine to Clinic'}</h3>
            
            {!editingVac && (
              <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-lg">
                <button onClick={() => setModalMode('existing')} className={`flex-1 py-1 text-sm font-bold rounded ${modalMode === 'existing' ? 'bg-white shadow' : 'text-slate-500'}`}>Existing Database</button>
                <button onClick={() => setModalMode('new')} className={`flex-1 py-1 text-sm font-bold rounded ${modalMode === 'new' ? 'bg-white shadow text-purple-600' : 'text-slate-500'}`}>✨ New AI Generate</button>
              </div>
            )}

            <div className="space-y-4">
              {modalMode === 'existing' && !editingVac && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Select Vaccine from Global DB</label>
                  <select 
                    onChange={e => {
                      const selected = globalVaccines.find(g => g.id === parseInt(e.target.value));
                      if (selected) setFormData({...formData, vaccine_id: selected.id, name: selected.name, type: selected.type, total_doses: selected.total_doses, has_booster: selected.has_booster});
                    }}
                    className="w-full p-3 border border-slate-200 rounded-lg outline-none focus:border-purple-500 bg-white"
                  >
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
                      <input type="text" placeholder="e.g. Hepatitis B" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="flex-1 p-3 border border-slate-200 rounded-lg outline-none focus:border-purple-500" />
                      <button onClick={handleAIAutoFill} className="bg-purple-100 text-purple-700 px-3 rounded-lg font-bold hover:bg-purple-200 flex items-center justify-center">
                        {aiLoading ? "..." : <Sparkles size={20}/>}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">AI Detected Type</label>
                    <input type="text" readOnly value={formData.type} className="w-full p-3 border border-slate-200 bg-slate-50 rounded-lg outline-none" />
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-bold text-slate-700 mb-1">Total Doses</label>
                      <input type="number" readOnly value={formData.total_doses} className="w-full p-3 border border-slate-200 bg-slate-50 rounded-lg outline-none" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-bold text-slate-700 mb-1">Booster?</label>
                      <input type="text" readOnly value={formData.has_booster ? "Yes" : "No"} className="w-full p-3 border border-slate-200 bg-slate-50 rounded-lg outline-none" />
                    </div>
                  </div>
                  {formData.schedules.length > 0 && (
                    <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                      <p className="text-xs font-bold text-purple-600 uppercase mb-2">Detected Intervals</p>
                      {formData.schedules.map((s: any, i: number) => (
                        <p key={i} className="text-sm font-medium">Dose {s.dose_number}: <span className="text-slate-600">{s.interval_description}</span></p>
                      ))}
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Clinic Price (RM)</label>
                <input type="number" placeholder="Price (RM)" value={formData.price || ''} onChange={e => setFormData({...formData, price: parseFloat(e.target.value) || 0})} className="w-full p-3 border border-slate-200 rounded-lg outline-none focus:border-purple-500" />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t pt-4">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-medium hover:bg-slate-200">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700">Save Setting</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}