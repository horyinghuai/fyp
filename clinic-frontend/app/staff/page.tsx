"use client";

import { useState, useEffect } from 'react';

const CLINIC_ID = "c1111111-1111-1111-1111-111111111111";

export default function StaffPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  
  const [formData, setFormData] = useState({
      ic: '', name: '', email: '', password: '', role: 'staff', status: 'active'
  });
  
  const [permissions, setPermissions] = useState<string[]>([]);

  const PERMISSION_OPTIONS = [
      { id: 'APPOINTMENT_MANAGEMENT', label: 'Timetable & Bookings' },
      { id: 'INVENTORY_MANAGEMENT', label: 'Vaccines & Blood Tests' },
      { id: 'PATIENT_REGISTRATION', label: 'Patient Management' },
      { id: 'DOCTOR_MANAGEMENT', label: 'Doctor Availability' },
      { id: 'CHAT_SUPPORT', label: 'Telegram/SMS Chat Replies' },
  ];

  const fetchUsers = async () => {
      const token = localStorage.getItem('aicas_token');
      try {
          const res = await fetch(`http://127.0.0.1:8000/admin/users`, {
              headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) setUsers(await res.json());
      } catch (err) {}
      setIsLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const openModal = (user: any = null) => {
      setEditingUser(user);
      if (user) {
          setFormData({
              ic: user.ic, name: user.name, email: user.email, password: '', role: user.role, status: user.status
          });
          if (user.permissions === 'ALL' || user.role.includes('admin')) {
              setPermissions(PERMISSION_OPTIONS.map(p => p.id));
          } else {
              setPermissions(user.permissions ? user.permissions.split(',').map((p:string) => p.trim()) : []);
          }
      } else {
          setFormData({ ic: '', name: '', email: '', password: '', role: 'staff', status: 'active' });
          setPermissions([]);
      }
      setShowModal(true);
  };

  const handleTogglePermission = (pid: string) => {
      if (formData.role.includes('admin')) return; // Admins get all automatically
      if (permissions.includes(pid)) {
          setPermissions(permissions.filter(p => p !== pid));
      } else {
          setPermissions([...permissions, pid]);
      }
  };

  const handleSave = async () => {
      if (!formData.name || !formData.email || (!editingUser && !formData.password) || (!editingUser && !formData.ic)) {
          return alert("Please fill all required fields");
      }

      const token = localStorage.getItem('aicas_token');
      const isEditing = !!editingUser;
      const url = isEditing ? `http://127.0.0.1:8000/admin/users/${editingUser.ic}` : `http://127.0.0.1:8000/admin/users`;
      
      const payload: any = {
          clinic_id: CLINIC_ID,
          name: formData.name,
          email: formData.email,
          role: formData.role,
          status: formData.status,
          permissions: permissions.length === PERMISSION_OPTIONS.length ? 'ALL' : permissions.join(', ')
      };

      if (!isEditing) payload.ic_passport_number = formData.ic;
      if (formData.password) payload.password = formData.password;

      try {
          const res = await fetch(url, {
              method: isEditing ? 'PUT' : 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify(payload)
          });
          
          if (res.ok) {
              setShowModal(false);
              fetchUsers();
          } else {
              const err = await res.json();
              alert(err.detail || "Action failed");
          }
      } catch (err) { alert("Server error"); }
  };

  if (isLoading) return <div className="animate-pulse h-64 bg-slate-200 rounded-2xl"></div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
           <h1 className="text-3xl font-bold text-slate-800">Staff & Permissions</h1>
           <p className="text-slate-500 mt-1">Manage who has access to the clinic portal.</p>
        </div>
        <button onClick={() => openModal()} className="px-5 py-2 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 transition">
          + Add Staff
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
            <thead>
                <tr className="bg-slate-50 border-b text-xs uppercase text-slate-500 font-bold">
                    <th className="p-4">Name & IC</th>
                    <th className="p-4">Email</th>
                    <th className="p-4">Role</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                </tr>
            </thead>
            <tbody>
                {users.map(u => (
                    <tr key={u.ic} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="p-4">
                            <div className="font-bold text-slate-800">{u.name}</div>
                            <div className="text-xs text-slate-500 font-mono">{u.ic}</div>
                        </td>
                        <td className="p-4 text-sm text-slate-600">{u.email}</td>
                        <td className="p-4">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                                u.role === 'primary_admin' ? 'bg-purple-100 text-purple-700' :
                                u.role === 'temporary_admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-700'
                            }`}>
                                {u.role.replace('_', ' ').toUpperCase()}
                            </span>
                        </td>
                        <td className="p-4">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${u.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                {u.status.toUpperCase()}
                            </span>
                        </td>
                        <td className="p-4 text-right">
                            <button onClick={() => openModal(u)} className="text-blue-600 font-bold text-sm hover:underline">Edit</button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>

      {showModal && (
          <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-white p-6 rounded-2xl w-[500px] shadow-2xl">
                <h3 className="text-xl font-bold mb-4 border-b pb-2">{editingUser ? 'Edit User' : 'New Staff Account'}</h3>
                
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">IC / Passport</label>
                            <input type="text" value={formData.ic} disabled={!!editingUser} onChange={e => setFormData({...formData, ic: e.target.value})} className="w-full p-2 border rounded-lg outline-none bg-slate-50 uppercase" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Status</label>
                            <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full p-2 border rounded-lg outline-none bg-white">
                                <option value="active">Active</option>
                                <option value="inactive">Inactive / Disabled</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Full Name</label>
                        <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 border rounded-lg outline-none bg-slate-50 uppercase" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
                            <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-2 border rounded-lg outline-none bg-slate-50" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Password {editingUser && '(Optional)'}</label>
                            <input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full p-2 border rounded-lg outline-none bg-slate-50" placeholder="••••••••" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Role</label>
                        <select 
                            value={formData.role} 
                            onChange={e => {
                                setFormData({...formData, role: e.target.value});
                                if (e.target.value.includes('admin')) setPermissions(PERMISSION_OPTIONS.map(p => p.id));
                            }} 
                            disabled={editingUser?.role === 'primary_admin'}
                            className="w-full p-2 border rounded-lg outline-none bg-white"
                        >
                            <option value="staff">Staff (Restricted Access)</option>
                            <option value="temporary_admin">Temporary Admin</option>
                            {editingUser?.role === 'primary_admin' && <option value="primary_admin">Primary Admin</option>}
                        </select>
                    </div>

                    {formData.role === 'staff' && (
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Module Permissions</label>
                            <div className="space-y-2">
                                {PERMISSION_OPTIONS.map(opt => (
                                    <label key={opt.id} className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
                                        <input 
                                            type="checkbox" 
                                            checked={permissions.includes(opt.id)}
                                            onChange={() => handleTogglePermission(opt.id)}
                                            className="w-4 h-4 accent-blue-600"
                                        />
                                        {opt.label}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-6 flex justify-end gap-3 pt-4 border-t">
                    <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold hover:bg-slate-200">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700">Save Account</button>
                </div>
            </div>
          </div>
      )}
    </div>
  );
}