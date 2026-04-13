"use client";

import { useState, useEffect } from 'react';
import { Syringe, Sparkles, AlertTriangle } from 'lucide-react';

const CLINIC_ID = "c1111111-1111-1111-1111-111111111111";

// Helper Function for Title Case Enforcement
const capitalizeFirstLetter = (str: string) => {
    if (!str) return '';
    return str.replace(/\b\w/g, l => l.toUpperCase());
};

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
      stock_quantity: '' as number | string, low_stock_threshold: 10 as number | string 
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
          const scheds = data.schedules || [];
          if (scheds.length === 0 && data.total_doses > 0) {
               scheds.push({dose_number: 1, interval_description: "Initial"});
          } else if (scheds.length > 0 && (!scheds[0].interval_description || scheds[0].interval_description.trim() === '')) {
               scheds[0].interval_description = "Initial";
          }

          setFormData({ 
              ...formData, 
              name: capitalizeFirstLetter(queryToSearch), 
              type: capitalizeFirstLetter(data.type || ''), 
              total_doses: data.total_doses || 1, 
              has_booster: data.has_booster || false, 
              schedules: scheds 
          });
      }
    } catch (e) { setAiErrorMsg("Failed to connect to AI server."); }
    setAiLoading(false);
  };

  const handleScheduleChange = (doseNum: number, interval: string) => {
      const newSchedules = [...formData.schedules];
      const idx = newSchedules.findIndex(s => s.dose_number === doseNum);
      if (idx >= 0) {
          newSchedules[idx].interval_description = capitalizeFirstLetter(interval);
      } else {
          newSchedules.push({ dose_number: doseNum, interval_description: capitalizeFirstLetter(interval) });
      }
      setFormData({...formData, schedules: newSchedules});
  };

  const handleSave = async () => {
    if (!formData.name && modalMode === 'new') {
        alert("⚠️ Vaccine name is required.");
        return;
    }
    
    if (!editingVac && modalMode === 'new') {
        if (globalVaccines.some(v => v.name.toLowerCase() === formData.name.toLowerCase())) {
            alert(`⚠️ Vaccine '${capitalizeFirstLetter(formData.name)}' is already listed in the database. Please select it from the Existing Database tab.`);
            return;
        }
    }

    if (!formData.price || formData.price <= 0) {
        alert("⚠️ Please insert a valid price before saving.");
        return;
    }
    
    const finalStock = typeof formData.stock_quantity === 'string' ? parseInt(formData.stock_quantity) || 0 : formData.stock_quantity;
    const finalThreshold = typeof formData.low_stock_threshold === 'string' ? parseInt(formData.low_stock_threshold) || 10 : formData.low_stock_threshold;
    
    if (finalStock < 0) {
        alert("⚠️ Please insert a valid stock quantity before saving.");
        return;
    }
    if (finalThreshold < 0) {
        alert("⚠️ Please insert a valid low stock threshold before saving.");
        return;
    }

    if (!confirm("Are you sure the vaccine details are correct? This will update the system's database and recalculate existing schedules.")) {
        return;
    }

    const payload = {
        ...formData,
        name: capitalizeFirstLetter(formData.name),
        type: capitalizeFirstLetter(formData.type),
        stock_quantity: finalStock,
        low_stock_threshold: finalThreshold
    }

    const isEditing = !!editingVac;
    const url = isEditing ? `http://127.0.0.1:8000/admin/vaccines/${editingVac.id}` : `http://127.0.0.1:8000/admin/vaccines`;
    
    try {
        const response = await fetch(url, { 
            method: isEditing ? 'PUT' : 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ clinic_id: CLINIC_ID, ...payload }) 
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
        let scheds = v.schedules || [];
        if (scheds.length > 0 && (!scheds[0].interval_description || scheds[0].interval_description.trim() === '')) {
             scheds[0].interval_description = "Initial";
        } else if (scheds.length === 0 && v.total_doses > 0) {
             scheds.push({dose_number: 1, interval_description: "Initial"});
        }
        
        setFormData({ 
            vaccine_id: v.id, name: capitalizeFirstLetter(v.name), type: capitalizeFirstLetter(v.type), total_doses: v.total_doses, 
            price: v.price, has_booster: v.has_booster, schedules: scheds,
            stock_quantity: v.stock_quantity !== undefined ? v.stock_quantity : '', 
            low_stock_threshold: v.low_stock_threshold !== undefined ? v.low_stock_threshold : 10
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
    <div className="max-w-7xl mx-auto pb-10">
      <div className="flex justify-between items-center mb-8">
        <div><h1 className="text-3xl font-bold text-slate-800">💉 Vaccine Inventory</h1></div>
        <button onClick={() => openModal()} className="px-4 py-2 bg-purple-600 text-white rounded-lg font-bold shadow-md">+ Add Vaccine</button>
      </div>

      {Object.keys(groupedVaccines).map(type => (
        <div key={type} className="mb-10">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 border-b-2 border-slate-200 pb-2">{type}</h2>
            <div className="grid grid-cols-2 gap-6">
            {groupedVaccines[type].map((v: any) => {
              const isLowStock = v.stock_quantity < v.low_stock_threshold;
              return (
              <div key={v.id} className={`bg-white rounded-2xl p-6 shadow-sm border ${isLowStock ? 'border-red-300' : 'border-slate-100'} group relative`}>
                <div className={`absolute top-0 left-0 w-1 h-full ${isLowStock ? 'bg-red-500' : 'bg-purple-500'}`}></div>
                <div className="flex justify-between">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase">Vaccine Name</label>
                    <h3 className="text-xl font-bold flex items-center gap-2"><Syringe size={20} className={isLowStock ? 'text-red-500' : 'text-purple-500'}/> {capitalizeFirstLetter(v.name)}</h3>
                    {v.has_booster && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full mt-2 font-bold inline-block">⭐ Booster Included</span>}
                  </div>
                  <div className="text-right">
                     <label className="block text-xs font-bold text-slate-400 uppercase">Price & Stock</label>
                     <span className="block text-2xl font-black text-emerald-500 mb-1">RM {v.price}</span>
                     <span className={`text-xs font-bold flex items-center justify-end gap-1 ${isLowStock ? 'text-red-500' : 'text-slate-500'}`}>
                         {isLowStock && <AlertTriangle size={14} />} Stock: {v.stock_quantity}
                     </span>
                  </div>
                </div>
                <div className={`mt-4 p-4 rounded-xl ${isLowStock ? 'bg-red-50' : 'bg-slate-50'}`}>
                  <DoseTimeline total={v.total_doses} />
                </div>
                <div className="mt-4 flex justify-end gap-2 border-t pt-4">
                  <button onClick={() => openModal(v)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200">Edit Details</button>
                  <button onClick={() => handleDelete(v.id)} className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100">Remove</button>
                </div>
              </div>
            )})}
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
                  <select onChange={e => { 
                      const s = unaddedGlobalVaccines.find(g => g.id === parseInt(e.target.value)); 
                      if (s) {
                          let scheds = s.schedules || [];
                          if (scheds.length > 0 && (!scheds[0].interval_description || scheds[0].interval_description.trim() === '')) {
                               scheds[0].interval_description = "Initial";
                          } else if (scheds.length === 0 && s.total_doses > 0) {
                               scheds.push({dose_number: 1, interval_description: "Initial"});
                          }
                          setFormData({...formData, vaccine_id: s.id, name: capitalizeFirstLetter(s.name), type: capitalizeFirstLetter(s.type), total_doses: s.total_doses, has_booster: s.has_booster, schedules: scheds}); 
                      } else {
                          setFormData({...formData, vaccine_id: null, name: '', type: '', total_doses: 1, has_booster: false, schedules: []});
                      }
                  }} className="w-full p-3 border rounded-lg outline-none bg-white">
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
                    <button onClick={() => handleAIAutoFill(searchQuery)} className="bg-purple-100 text-purple-700 px-3 rounded-lg font-bold hover:bg-purple-200">{aiLoading ? "..." : <Sparkles size={20}/>}</button>
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

              {/* Editable Fields rendered for New AI/Manual additions, Modifying Clinic existing, OR once an Existing DB dropdown item is selected */}
              {((modalMode === 'new') || editingVac || (modalMode === 'existing' && formData.vaccine_id)) && (
                  <div className="space-y-4 border-t pt-4 border-slate-100">
                    <h4 className="font-bold text-xs text-slate-500 uppercase">General Details</h4>
                    
                    <div><label className="block text-xs font-bold text-slate-700 mb-1">Vaccine Name</label><input type="text" placeholder="e.g. Engerix-B" value={formData.name} onChange={e => setFormData({...formData, name: capitalizeFirstLetter(e.target.value)})} className="w-full p-3 border rounded-lg outline-none" /></div>
                    
                    <div><label className="block text-xs font-bold text-slate-700 mb-1">Vaccine Type</label><input type="text" placeholder="e.g. Hepatitis B" value={formData.type} onChange={e => setFormData({...formData, type: capitalizeFirstLetter(e.target.value)})} className="w-full p-3 border rounded-lg outline-none" /></div>
                    
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
                            <p className="text-[10px] text-slate-500 mb-2">Leave intervals blank to signify optional doses without automatic rescheduling.</p>
                            {Array.from({ length: formData.total_doses }).map((_, i) => {
                                const doseNum = i + 1;
                                let val = formData.schedules.find(s => s.dose_number === doseNum)?.interval_description || '';
                                if (doseNum === 1 && val === '') val = 'Initial'; 
                                
                                return (
                                    <div key={`dose-${doseNum}`}>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Dose {doseNum} Interval</label>
                                        <input type="text" value={val} placeholder={doseNum === 1 ? "e.g. Initial" : "e.g. 1 month"} onChange={e => handleScheduleChange(doseNum, e.target.value)} className="w-full p-2 border rounded outline-none text-sm" />
                                    </div>
                                );
                            })}
                            {formData.has_booster && (
                                <div key="booster">
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Booster Interval</label>
                                    <input type="text" value={formData.schedules.find(s => s.dose_number === formData.total_doses + 1)?.interval_description || ''} placeholder="e.g. 6 months (Leave blank if optional)" onChange={e => handleScheduleChange(formData.total_doses + 1, e.target.value)} className="w-full p-2 border rounded outline-none text-sm" />
                                </div>
                            )}
                        </div>
                    )}
                  </div>
              )}

              {/* Clinic Specific Details for ALL modes (Hidden completely if Existing DB has no selected item yet) */}
              {((modalMode === 'new') || editingVac || (modalMode === 'existing' && formData.vaccine_id)) && (
                  <div className="space-y-4 border-t pt-4 border-slate-100">
                      <h4 className="font-bold text-xs text-slate-500 uppercase">Clinic Offerings & Stock</h4>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Clinic Price (RM)</label>
                        <input type="number" placeholder="RM Price" value={formData.price || ''} onChange={e => setFormData({...formData, price: parseFloat(e.target.value) || 0})} className="w-full p-3 border rounded-lg outline-none" />
                      </div>
                      
                      <div className="flex gap-4">
                          <div className="flex-1">
                            <label className="block text-sm font-bold text-slate-700 mb-1">Stock Quantity</label>
                            <input type="number" placeholder="Current Stock" value={formData.stock_quantity} onChange={e => setFormData({...formData, stock_quantity: e.target.value})} className="w-full p-3 border rounded-lg outline-none" />
                          </div>
                          <div className="flex-1">
                            <label className="block text-sm font-bold text-slate-700 mb-1">Low Alert Threshold</label>
                            <input type="number" placeholder="Alert Level" value={formData.low_stock_threshold} onChange={e => setFormData({...formData, low_stock_threshold: e.target.value})} className="w-full p-3 border rounded-lg outline-none" />
                          </div>
                      </div>
                  </div>
              )}
              
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t pt-4">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-medium hover:bg-slate-200">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700">Save Data</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}