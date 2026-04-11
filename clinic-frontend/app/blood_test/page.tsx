"use client";

import { useState, useEffect } from 'react';

const CLINIC_ID = "c1111111-1111-1111-1111-111111111111";

export default function BloodTestsPage() {
  const [packages, setPackages] = useState<any[]>([]);
  const [singles, setSingles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingBt, setEditingBt] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', description: '', price: 0, test_type: 'single' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [pkgRes, sglRes] = await Promise.all([
        fetch(`http://127.0.0.1:8000/blood-tests/${CLINIC_ID}/package`),
        fetch(`http://127.0.0.1:8000/blood-tests/${CLINIC_ID}/single`)
      ]);
      setPackages(await pkgRes.json());
      setSingles(await sglRes.json());
      setIsLoading(false);
    } catch (e) { setIsLoading(false); }
  };

  const handleSave = async () => {
    const isEditing = !!editingBt;
    const url = isEditing ? `http://127.0.0.1:8000/admin/blood-tests/${editingBt.id}` : `http://127.0.0.1:8000/admin/blood-tests`;
    
    await fetch(url, {
      method: isEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinic_id: CLINIC_ID, ...formData })
    });
    
    setShowModal(false);
    loadData();
  };

  const handleDelete = async (id: number) => {
    if(confirm("Delete this Blood Test?")) {
      await fetch(`http://127.0.0.1:8000/admin/blood-tests/${id}`, { method: 'DELETE' });
      loadData();
    }
  };

  const openModal = (bt = null) => {
    setEditingBt(bt);
    if(bt) setFormData({ name: bt.name, description: bt.description, price: bt.price, test_type: bt.test_type });
    else setFormData({ name: '', description: '', price: 0, test_type: 'single' });
    setShowModal(true);
  };

  if (isLoading) return <div className="animate-pulse h-64 bg-slate-200 rounded-2xl"></div>;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">🩸 Blood Test Services</h1>
          <p className="text-slate-500 mt-1">Manage diagnostic packages and standalone test pricing.</p>
        </div>
        <button onClick={() => openModal()} className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700">+ Add Blood Test</button>
      </div>

      <h2 className="font-bold text-lg border-b pb-2 mb-4">Packages</h2>
      <div className="grid grid-cols-2 gap-4 mb-8">
        {packages.map(p => (
          <div key={p.id} className="bg-white rounded-xl p-6 shadow-sm border-t-4 border-emerald-500 flex flex-col">
            <div className="flex justify-between mb-2">
              <h3 className="font-bold text-lg">{p.name}</h3>
              <span className="font-black text-emerald-600">RM {p.price}</span>
            </div>
            <p className="text-sm text-slate-500 mb-4">{p.description}</p>
            <div className="mt-auto flex justify-end gap-2">
              <button onClick={() => openModal(p)} className="text-sm px-3 py-1 bg-slate-100 rounded">Edit</button>
              <button onClick={() => handleDelete(p.id)} className="text-sm px-3 py-1 bg-red-50 text-red-600 rounded">Delete</button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="font-bold text-lg border-b pb-2 mb-4">Standalone Tests</h2>
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b"><th className="p-4">Name</th><th className="p-4">Description</th><th className="p-4">Price</th><th className="p-4 text-center">Actions</th></thead>
          <tbody>
            {singles.map(s => (
              <tr key={s.id} className="border-b border-slate-50">
                <td className="p-4 font-bold">{s.name}</td>
                <td className="p-4 text-sm text-slate-500">{s.description}</td>
                <td className="p-4 font-bold text-emerald-600">RM {s.price}</td>
                <td className="p-4 text-center space-x-2">
                  <button onClick={() => openModal(s)} className="text-sm px-3 py-1 bg-slate-100 rounded">Edit</button>
                  <button onClick={() => handleDelete(s.id)} className="text-sm px-3 py-1 bg-red-50 text-red-600 rounded">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl w-96 shadow-2xl">
            <h3 className="text-xl font-bold mb-4">{editingBt ? 'Edit Test' : 'Add Test'}</h3>
            <div className="space-y-3">
              <input type="text" placeholder="Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 border rounded" />
              <input type="text" placeholder="Description" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full p-2 border rounded" />
              <input type="number" placeholder="Price" value={formData.price} onChange={e => setFormData({...formData, price: parseFloat(e.target.value)})} className="w-full p-2 border rounded" />
              <select value={formData.test_type} onChange={e => setFormData({...formData, test_type: e.target.value})} className="w-full p-2 border rounded">
                <option value="single">Single Test</option><option value="package">Package</option>
              </select>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-100 rounded">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 bg-emerald-600 text-white rounded">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}