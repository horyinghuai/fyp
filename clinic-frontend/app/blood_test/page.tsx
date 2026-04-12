"use client";

import { useState, useEffect } from 'react';

const CLINIC_ID = "c1111111-1111-1111-1111-111111111111";

export default function BloodTestsPage() {
  const [packages, setPackages] = useState<any[]>([]);
  const [singles, setSingles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingBt, setEditingBt] = useState<any>(null);
  
  const [formData, setFormData] = useState<{name: string, description: string, price: number, test_type: string, component_ids: number[]}>({ 
    name: '', description: '', price: 0, test_type: 'single', component_ids: [] 
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [pkgRes, sglRes] = await Promise.all([ fetch(`http://127.0.0.1:8000/blood-tests/${CLINIC_ID}/package`), fetch(`http://127.0.0.1:8000/blood-tests/${CLINIC_ID}/single`) ]);
      setPackages(await pkgRes.json()); setSingles(await sglRes.json());
      setIsLoading(false);
    } catch (e) { setIsLoading(false); }
  };

  const handleSave = async (e: any) => {
    e.preventDefault();
    if (!formData.name || !formData.price) { alert("Name and Price are required!"); return; }

    try {
        const isEditing = !!editingBt;
        const url = isEditing ? `http://127.0.0.1:8000/admin/blood-tests/${editingBt.id}` : `http://127.0.0.1:8000/admin/blood-tests`;
        const res = await fetch(url, { method: isEditing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinic_id: CLINIC_ID, ...formData }) });
        if (!res.ok) throw new Error("Failed to save.");
        setShowModal(false); loadData();
    } catch (err) {
        alert("Failed to save. Ensure FastAPI is running.");
    }
  };

  const handleDelete = async (id: number) => {
    if(confirm("Delete this Blood Test?")) { await fetch(`http://127.0.0.1:8000/admin/blood-tests/${id}`, { method: 'DELETE' }); loadData(); }
  };

  const openModal = (bt: any = null) => {
    setEditingBt(bt);
    if(bt) setFormData({ name: bt.name, description: bt.description, price: bt.price, test_type: bt.test_type, component_ids: bt.component_ids || [] });
    else setFormData({ name: '', description: '', price: 0, test_type: 'single', component_ids: [] });
    setShowModal(true);
  };

  if (isLoading) return <div className="animate-pulse h-64 bg-slate-200 rounded-2xl"></div>;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-slate-800">🩸 Blood Test Services</h1>
        <button onClick={() => openModal()} className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold">+ Add Blood Test</button>
      </div>

      <h2 className="font-bold text-2xl text-slate-800 border-b-2 border-slate-200 pb-2 mb-6">1. Packages</h2>
      <div className="grid grid-cols-2 gap-4 mb-12">
        {packages.map(p => (
          <div key={p.id} className="bg-white rounded-xl p-6 shadow-sm border-t-4 border-emerald-500 flex flex-col">
            <div className="flex justify-between mb-2">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase">Package Name</label>
                <h3 className="font-bold text-lg text-slate-800">{p.name}</h3>
              </div>
              <div className="text-right">
                <label className="block text-xs font-bold text-slate-400 uppercase">Price</label>
                <span className="font-black text-emerald-600 text-xl">RM {p.price}</span>
              </div>
            </div>
            <label className="block text-xs font-bold text-slate-400 uppercase mt-2">Description</label>
            <p className="text-sm text-slate-700 mb-4">{p.description}</p>
            
            <div className="mt-auto">
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Included Tests ({p.included_tests?.length || 0})</label>
              <div className="flex flex-wrap gap-2 mb-4">
                {p.included_tests?.map((t: string, i: number) => <span key={i} className="bg-slate-100 text-xs px-2 py-1 rounded text-slate-600 font-medium border border-slate-200">{t}</span>)}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <button onClick={() => openModal(p)} className="text-sm px-4 py-2 bg-slate-100 rounded-lg font-medium">Edit Package</button>
              <button onClick={() => handleDelete(p.id)} className="text-sm px-4 py-2 bg-red-50 text-red-600 rounded-lg font-medium">Delete</button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="font-bold text-2xl text-slate-800 border-b-2 border-slate-200 pb-2 mb-6">2. Standalone Single Tests</h2>
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden mb-12">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200">
             <tr>
               <th className="p-4 text-slate-600 font-semibold text-sm uppercase">Test Name</th>
               <th className="p-4 text-slate-600 font-semibold text-sm uppercase">Description</th>
               <th className="p-4 text-slate-600 font-semibold text-sm uppercase">Price</th>
               <th className="p-4 text-slate-600 font-semibold text-center text-sm uppercase">Actions</th>
             </tr>
          </thead>
          <tbody>
            {singles.map((s, i) => (
              <tr key={s.id} className={`border-b border-slate-50 hover:bg-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                <td className="p-4 font-bold text-slate-800">{s.name}</td>
                <td className="p-4 text-sm text-slate-500">{s.description}</td>
                <td className="p-4 font-bold text-emerald-600">RM {s.price}</td>
                <td className="p-4 text-center space-x-2">
                  <button onClick={() => openModal(s)} className="text-sm px-3 py-1 bg-slate-100 text-slate-600 rounded font-medium">Edit</button>
                  <button onClick={() => handleDelete(s.id)} className="text-sm px-3 py-1 bg-red-50 text-red-600 rounded font-medium">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl w-[450px] shadow-2xl">
            <h3 className="text-xl font-bold mb-4 border-b pb-2">{editingBt ? 'Modify Test / Package' : 'Add New Record'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Test Name</label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-3 border rounded-lg outline-none" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Short Description</label>
                <input type="text" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full p-3 border rounded-lg outline-none" />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-1">Price (RM)</label>
                  <input type="number" value={formData.price || ''} onChange={e => setFormData({...formData, price: parseFloat(e.target.value) || 0})} className="w-full p-3 border rounded-lg outline-none" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-1">Type</label>
                  <select value={formData.test_type} onChange={e => setFormData({...formData, test_type: e.target.value})} className="w-full p-3 border rounded-lg outline-none bg-white">
                    <option value="single">Single Test</option>
                    <option value="package">Package Collection</option>
                  </select>
                </div>
              </div>
              
              {formData.test_type === 'package' && (
                <div className="mt-4">
                  <label className="block text-sm font-bold text-slate-700 mb-2">Select Included Single Tests</label>
                  <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
                    {singles.map(s => (
                      <label key={s.id} className="flex items-center gap-3 cursor-pointer bg-white p-2 rounded border border-slate-100 shadow-sm">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 accent-emerald-600"
                          checked={formData.component_ids.includes(s.id)}
                          onChange={(e) => {
                            if(e.target.checked) setFormData({...formData, component_ids: [...formData.component_ids, s.id]});
                            else setFormData({...formData, component_ids: formData.component_ids.filter(id => id !== s.id)});
                          }}
                        />
                        <span className="text-sm font-medium text-slate-700">{s.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t pt-4">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-100 rounded-lg font-medium">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium">Save Data</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}