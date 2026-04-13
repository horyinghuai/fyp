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
  const [aiOptions, setAiOptions] = useState<string[]>([]);
  const [aiErrorMsg, setAiErrorMsg] = useState("");
  
  const [showModal, setShowModal] = useState(false);
  const [editingVac, setEditingVac] = useState<any>(null);
  const [modalMode, setModalMode] = useState<'existing' | 'new'>('existing');
  const [searchQuery, setSearchQuery] = useState("");
  
  const [formData, setFormData] = useState({ 
      vaccine_id: null as any, name: '', type: '', total_doses: 1, 
      price: 0, has_booster: false, schedules: [] as any[], 
      stock_quantity: '' as any, low_stock_threshold: 10 
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
      setIsLoading(false); setError(false);
    } catch (e) { setIsLoading(false); setError(true); }
  };

  const handleAIAutoFill = async (queryToSearch: string) => {
    if (!queryToSearch) return;
    setAiLoading(true); setAiErrorMsg(""); setAiOptions([]);
    try {
      const res = await fetch(`http://127.0.0.1:8000/admin/ai/vaccine-schedule`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ search_query: queryToSearch })
      });
      const data = await res.json();
      
      if (data.status === "invalid") {
          setAiErrorMsg("Invalid vaccine name or type. Please try a valid medical term.");
          setFormData({...formData, name: ''});
      } else if (data.status === "multiple_options") {
          const existingNames = globalVaccines.map(v => v.name.toLowerCase());
          const filteredOptions = (data.options || []).filter((opt: string) => !existingNames.includes(opt.toLowerCase()));
          setAiOptions(filteredOptions);
          setFormData({...formData, name: ''});
      } else if (data.status === "exact_match") {
          setSearchQuery(queryToSearch);
          setFormData({ 
              ...formData, 
              name: queryToSearch, 
              type: data.type || '', 
              total_doses: data.total_doses || 1, 
              has_booster: data.has_booster || false, 
              schedules: data.schedules || [] 
          });
      }
    } catch (e) { setAiErrorMsg("Failed to connect to AI server."); }
    setAiLoading(false);
  };

  const handleScheduleChange = (doseNum: number, interval: string) => {
      const newSchedules = [...formData.schedules];
      const idx = newSchedules.findIndex(s => s.dose_number === doseNum);
      if (idx >= 0) {
          newSchedules[idx].interval_description = interval;
      } else {
          newSchedules.push({ dose_number: doseNum, interval_description: interval });
      }
      setFormData({...formData, schedules: newSchedules});
  };

  const handleSave = async () => {
    if (!formData.name && modalMode === 'new') {
        alert("⚠️ Vaccine name is required.");
        return;
    }
    
    // Check if duplicate name during manual / AI creation
    if (!editingVac && modalMode === 'new') {
        if (globalVaccines.some(v => v.name.toLowerCase() === formData.name.toLowerCase())) {
            alert(`⚠️ Vaccine '${formData.name}' is already listed in the database. Please select it from the Existing Database tab.`);
            return;
        }
    }

    if (!formData.price || formData.price <= 0) {
        alert("⚠️ Please insert a valid price before saving.");
        return;
    }
    if (formData.stock_quantity === '' || formData.stock_quantity < 0) {
        alert("⚠️ Please insert a valid stock quantity before saving.");
        return;
    }
    if (formData.low_stock_threshold === '' || formData.low_stock_threshold < 0) {
        alert("⚠️ Please insert a valid low stock threshold before saving.");
        return;
    }

    if (!confirm("Are you sure the vaccine details are correct? This will update the system's database.")) {
        return;
    }

    const isEditing = !!editingVac;
    const url = isEditing ? `http://127.0.0.1:8000/admin/vaccines/${editingVac.id}` : `http://127.0.0.1:8000/admin/vaccines`;
    
    try {
        const response = await fetch(url, { 
            method: isEditing ? 'PUT' : 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ clinic_id: CLINIC_ID, ...formData }) 
        });
        
        if (!response.ok) {
            const err = await response.json();
            alert(`Failed to save: ${err.detail}`);
            return;
        }
        setShowModal(false); 
        loadData();
    } catch(e) {
        alert("Failed to connect to the server.");
    }
  };

  const handleDelete = async (id: number) => {
    if(confirm("Remove this vaccine from clinic offerings?")) {
      await fetch(`http://127.0.0.1:8000/admin/vaccines/${id}/${CLINIC_ID}`, { method: 'DELETE' }); loadData();
    }
  };

  const openModal = (v: any = null) => {
    setEditingVac(v); setAiOptions([]); setAiErrorMsg(""); setSearchQuery("");
    if(v) { 
        setModalMode('existing'); 
        setFormData({ 
            vaccine_id: v.id, name: v.name, type: v.type, total_doses: v.total_doses, 
            price: v.price, has_booster: v.has_booster, schedules: v.schedules || [],
            stock_quantity: v.stock_quantity || '', low_stock_threshold: v.low_stock_threshold || 10
        }); 
    } 
    else { 
        setModalMode('existing'); 
        setFormData({ 
            vaccine_id: null, name: '', type: '', total_doses: 1, 
            price: 0, has_booster: false, schedules: [],
            stock_quantity: '', low_stock_threshold: 10
        }); 
    }
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

  const groupedVaccines = vaccines.reduce((acc: any, v: any) => {
      const t = (v.type || "Other").trim().toLowerCase().replace(/\b\w/g, (l: string) => l.toUpperCase());
      if (!acc[t]) acc[t] = [];
      acc[t].push(v);
      return acc;
  }, {});
  
  const unaddedGlobalVaccines = globalVaccines.filter(g => !vaccines.some(v => v.name === g.name));

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div><h1 className="text-3xl font-bold text-slate-800">💉 Vaccine Inventory</h1></div>
        <button onClick={() => openModal()} className="px-4 py-2 bg-purple-600 text-white rounded-lg font-bold shadow-md">+ Add Vaccine</button>
      </div>

      {Object.keys(groupedVaccines).map(type => (
        <div key={type} className="mb-10">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 border-b-2 border-slate-200 pb-2">{type}</h2>
            <div className="grid grid-cols-2 gap-6">
            {groupedVaccines[type].map((v: any) => (
              <div key={v.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 group relative">
                <div className="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>
                <div className="flex justify-between">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase">Vaccine Name</label>
                    <h3 className="text-xl font-bold flex items-center gap-2"><Syringe size={20} className="text-purple-500"/> {v.name}</h3>
                    {v.has_booster && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full mt-2 font-bold inline-block">⭐ Booster Included</span>}
                  </div>
                  <div className="text-right">
                     <label className="block text-xs font-bold text-slate-400 uppercase">Price</label>
                     <span className="text-2xl font-black text-emerald-500">RM {v.price}</span>
                     <p className="text-xs text-slate-500 mt-1">Stock: {v.stock_quantity}</p>
                  </div>
                </div>
                <div className="mt-4 p-4 bg-slate-50 rounded-xl">
                  <DoseTimeline total={v.total_doses} />
                </div>
                <div className="mt-4 flex justify-end gap-2 border-t pt-4">
                  <button onClick={() => openModal(v)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium">Edit Details</button>
                  <button onClick={() => handleDelete(v.id)} className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium">Remove</button>
                </div>
              </div>
            ))}
            </div>
        </div>
      ))}

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm overflow-y-auto pt-10 pb-10">
          <div className="bg-white p-6 rounded-2xl w-[500px] shadow-2xl relative my-auto max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4 border-b pb-2">{editingVac ? 'Modify Vaccine Details' : 'Add Vaccine to Clinic'}</h3>
            
            {!editingVac && (
              <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-lg">
                <button onClick={() => setModalMode('existing')} className={`flex-1 py-1 text-sm font-bold rounded ${modalMode === 'existing' ? 'bg-white shadow' : 'text-slate-500'}`}>Existing Database</button>
                <button onClick={() => setModalMode('new')} className={`flex-1 py-1 text-sm font-bold rounded ${modalMode === 'new' ? 'bg-white shadow text-purple-600' : 'text-slate-500'}`}>✨ AI / Manual Add</button>
              </div>
            )}

            <div className="space-y-4">
              {modalMode === 'existing' && !editingVac && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Select Vaccine Name</label>
                  <select onChange={e => { const s = unaddedGlobalVaccines.find(g => g.id === parseInt(e.target.value)); if (s) setFormData({...formData, vaccine_id: s.id, name: s.name, type: s.type, total_doses: s.total_doses, has_booster: s.has_booster}); }} className="w-full p-3 border rounded-lg outline-none bg-white">
                    <option value="">-- Choose Vaccine --</option>
                    {unaddedGlobalVaccines.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              )}

              {modalMode === 'new' && !editingVac && (
                <div className="mb-6">
                  <label className="block text-sm font-bold text-slate-700 mb-1">AI Search Vaccine Type or Name</label>
                  <div className="flex gap-2">
                    <input type="text" placeholder="e.g. COVID or Hepatitis B" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-1 p-3 border rounded-lg outline-none" />
                    <button onClick={() => handleAIAutoFill(searchQuery)} className="bg-purple-100 text-purple-700 px-3 rounded-lg font-bold">{aiLoading ? "..." : <Sparkles size={20}/>}</button>
                  </div>
                  {aiErrorMsg && <p className="text-red-500 text-xs font-bold mt-2">{aiErrorMsg}</p>}
                  
                  {aiOptions.length > 0 && (
                    <div className="mt-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <p className="text-xs font-bold text-slate-500 uppercase mb-2">Select a specific brand:</p>
                      <div className="flex flex-wrap gap-2">
                          {aiOptions.map(opt => (
                              <button key={opt} onClick={() => handleAIAutoFill(opt)} className="bg-white border border-purple-200 text-purple-700 px-3 py-1 rounded-full text-xs font-bold hover:bg-purple-50 transition">{opt}</button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Editable Fields for AI/Manual Adding or Full Editing */}
              {((modalMode === 'new') || editingVac) && (
                  <div className="space-y-4 border-t pt-4 border-slate-100">
                    <h4 className="font-bold text-xs text-slate-500 uppercase">General Details</h4>
                    
                    <div><label className="block text-xs font-bold text-slate-700 mb-1">Vaccine Name</label><input type="text" placeholder="e.g. Engerix-B" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-3 border rounded-lg outline-none" /></div>
                    
                    <div><label className="block text-xs font-bold text-slate-700 mb-1">Vaccine Type</label><input type="text" placeholder="e.g. Hepatitis B" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full p-3 border rounded-lg outline-none" /></div>
                    
                    <div className="flex gap-4">
                      <div className="flex-1">
                          <label className="block text-xs font-bold text-slate-700 mb-1">Total Doses</label>
                          <input type="number" min="1" value={formData.total_doses} onChange={e => setFormData({...formData, total_doses: parseInt(e.target.value) || 1})} className="w-full p-3 border rounded-lg outline-none" />
                      </div>
                      <div className="flex-1">
                          <label className="block text-xs font-bold text-slate-700 mb-1">Has Booster?</label>
                          <select value={formData.has_booster ? "yes" : "no"} onChange={e => setFormData({...formData, has_booster: e.target.value === "yes"})} className="w-full p-3 border rounded-lg outline-none bg-white">
                              <option value="no">No</option>
                              <option value="yes">Yes</option>
                          </select>
                      </div>
                    </div>

                    {/* Schedules Section */}
                    {formData.total_doses > 0 && (
                        <div className="bg-slate-50 p-4 rounded-xl space-y-3 border border-slate-100 mt-4">
                            <h4 className="font-bold text-xs text-slate-500 uppercase">Dose Schedules</h4>
                            {Array.from({ length: formData.total_doses }).map((_, i) => {
                                const doseNum = i + 1;
                                const val = formData.schedules.find(s => s.dose_number === doseNum)?.interval_description || '';
                                return (
                                    <div key={`dose-${doseNum}`}>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Dose {doseNum} Interval</label>
                                        <input type="text" value={val} placeholder={doseNum === 1 ? "e.g. initial" : "e.g. 1 month"} onChange={e => handleScheduleChange(doseNum, e.target.value)} className="w-full p-2 border rounded outline-none" />
                                    </div>
                                );
                            })}
                            {formData.has_booster && (
                                <div key="booster">
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Booster Interval</label>
                                    <input type="text" value={formData.schedules.find(s => s.dose_number === formData.total_doses + 1)?.interval_description || ''} placeholder="e.g. 6 months" onChange={e => handleScheduleChange(formData.total_doses + 1, e.target.value)} className="w-full p-2 border rounded outline-none" />
                                </div>
                            )}
                        </div>
                    )}
                  </div>
              )}

              {/* Clinic Specific Details for ALL modes */}
              <div className="space-y-4 border-t pt-4 border-slate-100">
                  <h4 className="font-bold text-xs text-slate-500 uppercase">Clinic Offerings & Stock</h4>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Clinic Price (RM)</label>
                    <input type="number" placeholder="RM Price" value={formData.price || ''} onChange={e => setFormData({...formData, price: parseFloat(e.target.value) || 0})} className="w-full p-3 border rounded-lg outline-none" />
                  </div>
                  
                  <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="block text-sm font-bold text-slate-700 mb-1">Stock Quantity</label>
                        <input type="number" placeholder="Current Stock" value={formData.stock_quantity} onChange={e => setFormData({...formData, stock_quantity: e.target.value === '' ? '' : parseInt(e.target.value)})} className="w-full p-3 border rounded-lg outline-none" />
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-bold text-slate-700 mb-1">Low Alert Threshold</label>
                        <input type="number" placeholder="Alert Level" value={formData.low_stock_threshold} onChange={e => setFormData({...formData, low_stock_threshold: e.target.value === '' ? '' : parseInt(e.target.value)})} className="w-full p-3 border rounded-lg outline-none" />
                      </div>
                  </div>
              </div>
              
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t pt-4">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-medium">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium">Save Data</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}