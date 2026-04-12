"use client";

import { useState, useEffect } from 'react';

const CLINIC_ID = "c1111111-1111-1111-1111-111111111111";

const COUNTRIES = [
  "Malaysia", "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia", "Australia", 
  "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", 
  "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", 
  "Burkina Faso", "Burundi", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", 
  "China", "Colombia", "Comoros", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark", 
  "Djibouti", "Dominican Republic", "East Timor", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", 
  "Eritrea", "Estonia", "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", 
  "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", 
  "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", 
  "Kazakhstan", "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", 
  "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Macedonia", "Madagascar", "Malawi", 
  "Maldives", "Mali", "Malta", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", 
  "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", 
  "New Zealand", "Nicaragua", "Niger", "Nigeria", "Norway", "Oman", "Pakistan", "Palau", "Panama", 
  "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", 
  "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent", "Samoa", "San Marino", 
  "Sao Tome", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", 
  "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "Spain", "Sri Lanka", "Sudan", 
  "Suriname", "Swaziland", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", 
  "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda", 
  "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", 
  "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];

export default function PatientsPage() {
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<any>(null);
  
  const [isMalaysian, setIsMalaysian] = useState(true);
  const [formData, setFormData] = useState({ ic: '', name: '', phone: '', gender: 'MALE', nationality: 'MALAYSIA', address: '' });

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    fetch(`http://127.0.0.1:8000/admin/patients/${CLINIC_ID}`)
      .then(res => res.json())
      .then(data => { setPatients(data); setIsLoading(false); })
      .catch(() => { setIsLoading(false); });
  };

  const handleICChange = (val: string) => {
      if (isMalaysian) {
          let clean = val.replace(/[^0-9]/g, '');
          if (clean.length <= 12) {
              let formatted = clean;
              if (clean.length > 6) formatted = clean.slice(0,6) + '-' + clean.slice(6);
              if (clean.length > 8) formatted = formatted.slice(0,9) + '-' + clean.slice(8);
              
              let gender = formData.gender;
              if (clean.length === 12) {
                  const lastDigit = parseInt(clean[11]);
                  gender = lastDigit % 2 === 0 ? 'FEMALE' : 'MALE';
              }
              setFormData({...formData, ic: formatted, gender: gender, nationality: 'MALAYSIA'});
          }
      } else {
          setFormData({...formData, ic: val});
      }
  };

  const handleSave = async () => {
    if (!formData.ic || !formData.name || !formData.phone) {
        alert("⚠️ IC/Passport, Name, and Phone are required fields."); return;
    }
    if (isMalaysian) {
        const cleanIC = formData.ic.replace(/[^0-9]/g, '');
        if (cleanIC.length !== 12) {
            alert("⚠️ Malaysian IC must be exactly 12 digits."); return;
        }
    }

    try {
        const isEditing = !!editingPatient;
        const url = isEditing ? `http://127.0.0.1:8000/admin/patients/${editingPatient.ic_passport_number}` : `http://127.0.0.1:8000/register-patient`;
        const payload = isEditing ? { ic_passport_number: formData.ic, name: formData.name, phone: formData.phone, gender: formData.gender, nationality: formData.nationality, address: formData.address } 
                                  : { clinic_id: CLINIC_ID, ic_passport_number: formData.ic, name: formData.name, phone: formData.phone, gender: formData.gender, nationality: formData.nationality, address: formData.address };

        const res = await fetch(url, { method: isEditing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        
        if (data.status === "error") { alert("⚠️ " + data.reason); return; }
        
        setShowModal(false);
        loadData();
    } catch (e) {
        alert("⚠️ Failed to save. Check your connection.");
    }
  };

  const handleDelete = async (ic: string) => {
    if(confirm("Are you sure you want to delete this patient?")) {
      await fetch(`http://127.0.0.1:8000/admin/patients/${ic}`, { method: 'DELETE' }); loadData();
    }
  };

  const openModal = (patient: any = null) => {
    setEditingPatient(patient);
    if(patient) {
        const isMy = patient.nationality.toUpperCase() === 'MALAYSIA';
        setIsMalaysian(isMy);
        setFormData({ ic: patient.ic_passport_number, name: patient.name, phone: patient.phone, gender: patient.gender, nationality: patient.nationality, address: patient.address || '' });
    } else {
        setIsMalaysian(true);
        setFormData({ ic: '', name: '', phone: '', gender: 'MALE', nationality: 'MALAYSIA', address: '' });
    }
    setShowModal(true);
  };

  const filteredPatients = patients.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.ic_passport_number.includes(search));

  if (isLoading) return <div className="animate-pulse h-64 bg-slate-200 rounded-2xl"></div>;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div><h1 className="text-3xl font-bold text-slate-800">👥 Patient Directory</h1></div>
        <div className="flex gap-4">
          <input type="text" placeholder="Search Name or IC..." value={search} onChange={(e) => setSearch(e.target.value)} className="px-4 py-2 border rounded-lg outline-none w-64" />
          <button onClick={() => openModal()} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold shadow-md">+ Add Patient</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr><th className="p-4 font-semibold text-slate-600">Patient Details</th><th className="p-4 font-semibold text-slate-600">IC / Passport</th><th className="p-4 font-semibold text-slate-600">Contact</th><th className="p-4 font-semibold text-slate-600 text-center">Actions</th></tr>
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
                  <button onClick={() => openModal(p)} className="px-3 py-1 bg-slate-100 rounded text-sm font-medium text-slate-600 hover:bg-slate-200">Edit</button>
                  <button onClick={() => handleDelete(p.ic_passport_number)} className="px-3 py-1 bg-red-100 text-red-600 rounded text-sm font-medium hover:bg-red-200">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl w-[450px] shadow-2xl">
            <h3 className="text-xl font-bold mb-4 border-b pb-2">{editingPatient ? 'Modify Patient Data' : 'Add New Patient'}</h3>
            
            <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-lg">
                <button onClick={() => { setIsMalaysian(true); setFormData({...formData, nationality: 'MALAYSIA', ic: ''}); }} className={`flex-1 py-1 text-sm font-bold rounded ${isMalaysian ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Malaysian</button>
                <button onClick={() => { setIsMalaysian(false); setFormData({...formData, ic: ''}); }} className={`flex-1 py-1 text-sm font-bold rounded ${!isMalaysian ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Non-Malaysian</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">{isMalaysian ? "IC Number" : "Passport Number"}</label>
                <input type="text" placeholder={isMalaysian ? "e.g. 900101-14-5533" : "Passport ID"} value={formData.ic} onChange={e => handleICChange(e.target.value)} className="w-full p-3 border rounded-lg outline-none font-mono" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Patient Full Name</label>
                <input type="text" placeholder="Full Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-3 border rounded-lg outline-none" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Home Address</label>
                <input type="text" placeholder="Full Address" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full p-3 border rounded-lg outline-none" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Phone Number</label>
                <input type="text" placeholder="+60123456789" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-3 border rounded-lg outline-none" />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-1">Gender</label>
                  <select value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})} className="w-full p-3 border rounded-lg outline-none bg-white">
                    <option value="MALE">Male</option><option value="FEMALE">Female</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-1">Nationality</label>
                  {isMalaysian ? (
                      <input type="text" readOnly value="MALAYSIA" className="w-full p-3 border bg-slate-50 rounded-lg outline-none font-bold text-slate-500" />
                  ) : (
                      <select value={formData.nationality} onChange={e => setFormData({...formData, nationality: e.target.value})} className="w-full p-3 border rounded-lg outline-none bg-white">
                        {COUNTRIES.map(c => <option key={c} value={c.toUpperCase()}>{c}</option>)}
                      </select>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t pt-4">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-medium hover:bg-slate-200 transition">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition">Save Patient</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}