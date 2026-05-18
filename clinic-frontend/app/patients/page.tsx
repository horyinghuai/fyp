"use client";

import { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Camera, FileUp, Smartphone } from 'lucide-react';

const COUNTRIES = [
  "Malaysia", "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia", "Australia", 
  "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", 
  "China", "India", "Indonesia", "Singapore", "Thailand", "United Kingdom", "United States"
];

export default function PatientsPage() {
  const [clinicId, setClinicId] = useState<string>('');
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<any>(null);
  
  const [isMalaysian, setIsMalaysian] = useState(true);
  const [isMyKadUploaded, setIsMyKadUploaded] = useState(false);
  const [formData, setFormData] = useState({ ic: '', name: '', phone: '', gender: 'MALE', nationality: 'MALAYSIA', address: '' });

  // OCR States
  const [ocrMode, setOcrMode] = useState<'none'|'pc'|'mobile'>('none');
  const [mobileSessionId, setMobileSessionId] = useState<string | null>(null);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const pcVideoRef = useRef<HTMLVideoElement>(null);
  const pcCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => { 
      const userStr = localStorage.getItem('aicas_user');
      if (userStr) {
          const user = JSON.parse(userStr);
          setClinicId(user.clinic_id);
          loadData(user.clinic_id);
      }
  }, []);

  const loadData = async (cid: string) => {
    const token = localStorage.getItem('aicas_token');
    try {
        const res = await fetch(`http://127.0.0.1:8000/admin/patients/${cid}`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.status === 401) {
            window.location.href = '/login';
            return;
        }
        if (res.ok) setPatients(await res.json());
    } catch (err) {}
    setIsLoading(false);
  };

  // --- OCR FUNCTIONS (FILE & PC SCAN) ---
  const handleOcrFileResponse = async (blob: Blob) => {
      setOcrProcessing(true);
      const form = new FormData();
      form.append("file", blob, "mykad.jpg");
      try {
          const res = await fetch("http://127.0.0.1:8000/admin/ocr-mykad", { method: 'POST', body: form });
          const data = await res.json();
          if (data.success && data.data.ic) {
              setFormData({...formData, ic: data.data.ic, name: data.data.name, address: data.data.address, gender: data.data.gender, nationality: 'MALAYSIA'});
              setIsMyKadUploaded(true);
              setOcrMode('none');
              alert("MyKad scanned successfully!");
          } else alert("Failed to read MyKad cleanly. Please try again.");
      } catch(e) { alert("OCR Failed due to network connection."); }
      setOcrProcessing(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) handleOcrFileResponse(e.target.files[0]);
  };

  const startPcCamera = async () => {
      setOcrMode('pc');
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
          if (pcVideoRef.current) pcVideoRef.current.srcObject = stream;
      } catch(e) {
          alert("Camera access denied.");
          setOcrMode('none');
      }
  };

  const capturePcCamera = () => {
      if (!pcVideoRef.current || !pcCanvasRef.current) return;
      const video = pcVideoRef.current;
      const canvas = pcCanvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob((blob) => {
          if (!blob) return;
          setOcrProcessing(true);
          const form = new FormData();
          form.append("file", blob, "mykad.jpg");
          
          fetch("http://127.0.0.1:8000/admin/ocr-mykad", { method: 'POST', body: form })
            .then(res => res.json())
            .then(data => {
                if (data.success && data.data.ic) {
                    // Turn OFF camera ONLY on success
                    const stream = video.srcObject as MediaStream;
                    stream?.getTracks().forEach(t => t.stop());
                    
                    setFormData({...formData, ic: data.data.ic, name: data.data.name, address: data.data.address, gender: data.data.gender, nationality: 'MALAYSIA'});
                    setIsMyKadUploaded(true);
                    setOcrMode('none');
                    alert("MyKad scanned successfully!");
                } else {
                    alert("Failed to read MyKad cleanly. Please adjust lighting and tap Capture again.");
                }
            })
            .catch(e => alert("OCR Failed due to network connection."))
            .finally(() => setOcrProcessing(false));
      }, 'image/jpeg');
  };

  // --- MOBILE QR OCR ---
  const startMobileScan = async () => {
      const sessionId = Math.random().toString(36).substring(2, 15);
      setMobileSessionId(sessionId);
      setOcrMode('mobile');
      await fetch(`http://127.0.0.1:8000/admin/ocr-session/${sessionId}/generate`);
      
      const poll = setInterval(async () => {
          try {
              const res = await fetch(`http://127.0.0.1:8000/admin/ocr-session/${sessionId}`);
              const data = await res.json();
              if (data.status === 'completed') {
                  clearInterval(poll);
                  setFormData({...formData, ic: data.data.ic, name: data.data.name, address: data.data.address, gender: data.data.gender, nationality: 'MALAYSIA'});
                  setIsMyKadUploaded(true);
                  setOcrMode('none');
                  setMobileSessionId(null);
                  alert("Mobile scan successful!");
              }
          } catch(e) {}
      }, 2000);
  };

  const cancelOcr = () => {
      if (ocrMode === 'pc') {
          const stream = pcVideoRef.current?.srcObject as MediaStream;
          stream?.getTracks().forEach(t => t.stop());
      }
      setOcrMode('none');
      setMobileSessionId(null);
  };
  // ---------------------

  const handleICChange = (val: string) => {
      if (isMalaysian) {
          let clean = val.replace(/[^0-9]/g, '');
          if (clean.length <= 12) {
              let formatted = clean;
              if (clean.length > 6) formatted = clean.slice(0,6) + '-' + clean.slice(6);
              if (clean.length > 8) formatted = formatted.slice(0,9) + '-' + clean.slice(8);
              let gender = formData.gender;
              if (clean.length === 12) { gender = parseInt(clean[11]) % 2 === 0 ? 'FEMALE' : 'MALE'; }
              setFormData({...formData, ic: formatted, gender: gender, nationality: 'MALAYSIA'});
          }
      } else { setFormData({...formData, ic: val.toUpperCase()}); }
  };

  const handleSave = async () => {
    if (!formData.ic) return alert("⚠️ IC / Passport Number is required.");
    if (!formData.name) return alert("⚠️ Patient Name is required.");
    if (!formData.phone) return alert("⚠️ Phone Number is required.");

    // STRICT PHONE FORMATTING LOGIC
    let finalPhone = formData.phone.trim().replace(/ /g, '');
    
    if (isMalaysian) {
        let cleanDigits = finalPhone.replace(/\D/g, '');
        if (cleanDigits.startsWith('60')) cleanDigits = cleanDigits.substring(2);
        else if (cleanDigits.startsWith('0')) cleanDigits = cleanDigits.substring(1);
        
        if (!cleanDigits.startsWith('1') || (cleanDigits.length !== 9 && cleanDigits.length !== 10)) {
            return alert("Invalid Malaysian phone format. Valid formats: 01X-XXXXXXX, +601XXXXXXXX.");
        }
        finalPhone = `+60${cleanDigits}`;
    } else {
        if (!finalPhone.startsWith('+')) {
            return alert("⚠️ For Non-Malaysian patients, phone number must start with a '+' symbol.");
        }
    }

    if (isMalaysian) {
        const cleanIC = formData.ic.replace(/[^0-9]/g, '');
        if (cleanIC.length !== 12) return alert("⚠️ Malaysian IC must be exactly 12 digits.");
    }

    if (!window.confirm("Are you sure this details are correct?")) return;
    
    try {
        const token = localStorage.getItem('aicas_token');
        const isEditing = !!editingPatient;
        const url = isEditing ? `http://127.0.0.1:8000/admin/patients/${editingPatient.id}` : `http://127.0.0.1:8000/register-patient`;
        
        const payload = isEditing ? { 
            ic_passport_number: formData.ic.toUpperCase(), name: formData.name.toUpperCase(), phone: finalPhone, 
            gender: formData.gender.toUpperCase(), nationality: formData.nationality.toUpperCase(), address: formData.address.toUpperCase() 
        } : { 
            clinic_id: clinicId, ic_passport_number: formData.ic.toUpperCase(), name: formData.name.toUpperCase(), 
            phone: finalPhone, gender: formData.gender.toUpperCase(), nationality: formData.nationality.toUpperCase(), address: formData.address.toUpperCase() 
        };

        const res = await fetch(url, { method: isEditing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload) });
        
        if (res.status === 401) return window.location.href = '/login';
        
        // INTERCEPT THE DUPLICATE ERROR HERE
        if (res.status === 409) {
            const errData = await res.json();
            return alert("⚠️ " + errData.detail); 
        }
        
        const data = await res.json();
        if (data.status === "error") return alert("⚠️ " + data.reason);
        
        setShowModal(false); loadData(clinicId);
    } catch (e) { alert("⚠️ Failed to save. Check your connection."); }
  };

  const handleDelete = async (patient_id: string) => {
    if(window.confirm("Are you sure you want to delete this patient? Deleting this patient will also delete all records of this patient also.")) {
      const token = localStorage.getItem('aicas_token');
      await fetch(`http://127.0.0.1:8000/admin/patients/${patient_id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }); 
      loadData(clinicId);
    }
  };

  const openModal = (patient: any = null) => {
    setEditingPatient(patient);
    setIsMyKadUploaded(false);
    setOcrMode('none');
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
            <tr>
              <th className="p-4 font-semibold text-slate-600">Patient Details</th>
              <th className="p-4 font-semibold text-slate-600">IC / Passport</th>
              <th className="p-4 font-semibold text-slate-600">Contact</th>
              <th className="p-4 font-semibold text-slate-600 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPatients.length === 0 && !isLoading && (
                <tr><td colSpan={4} className="p-8 text-center text-slate-500 font-medium">[No patient found]</td></tr>
            )}
            {filteredPatients.map((p, i) => (
              <tr key={p.id} className={`border-b border-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                <td className="p-4">
                  <div className="font-bold text-slate-800">{p.name}</div>
                  <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full">{p.gender}</span>
                  <span className="text-xs text-slate-500 ml-2">{p.nationality}</span>
                </td>
                <td className="p-4 font-mono text-slate-600">{p.ic_passport_number}</td>
                <td className="p-4 text-slate-600">{p.phone}</td>
                <td className="p-4 text-center space-x-2">
                  <button onClick={() => openModal(p)} className="px-3 py-1 bg-slate-100 rounded text-sm font-medium text-slate-600 hover:bg-slate-200">Edit</button>
                  <button onClick={() => handleDelete(p.id)} className="px-3 py-1 bg-red-100 text-red-600 rounded text-sm font-medium hover:bg-red-200">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl w-[500px] shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4 border-b pb-2">{editingPatient ? 'Modify Patient Data' : 'Add New Patient'}</h3>
            
            <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-lg">
                <button onClick={() => { setIsMalaysian(true); setFormData({...formData, nationality: 'MALAYSIA', ic: '', phone: ''}); setIsMyKadUploaded(false); }} className={`flex-1 py-1 text-sm font-bold rounded ${isMalaysian ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Malaysian</button>
                <button onClick={() => { setIsMalaysian(false); setFormData({...formData, ic: '', nationality: '', phone: ''}); setIsMyKadUploaded(false); }} className={`flex-1 py-1 text-sm font-bold rounded ${!isMalaysian ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Non-Malaysian</button>
            </div>

            {isMalaysian && (
                <div className="mb-4 bg-slate-50 p-4 border rounded-xl">
                    <label className="block text-sm font-bold text-slate-700 mb-3">MyKad Auto-Fill (OCR)</label>
                    
                    {ocrMode === 'none' && (
                        <div className="flex gap-2">
                            <label className="flex-1 p-2 bg-white border border-slate-300 text-slate-700 font-bold text-sm rounded-lg hover:bg-slate-100 cursor-pointer flex items-center justify-center gap-2">
                                <FileUp size={16}/> Upload File
                                <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                            </label>
                            <button onClick={startPcCamera} type="button" className="flex-1 p-2 bg-white border border-slate-300 text-slate-700 font-bold text-sm rounded-lg hover:bg-slate-100 flex items-center justify-center gap-2">
                                <Camera size={16}/> PC Scan
                            </button>
                            <button onClick={startMobileScan} type="button" className="flex-1 p-2 bg-white border border-blue-300 text-blue-700 font-bold text-sm rounded-lg hover:bg-blue-50 flex items-center justify-center gap-2">
                                <Smartphone size={16}/> Mobile Scan
                            </button>
                        </div>
                    )}

                    {ocrProcessing && <p className="text-blue-600 font-bold text-sm text-center py-4 animate-pulse">Analyzing MyKad with AI...</p>}

                    {ocrMode === 'pc' && !ocrProcessing && (
                        <div className="flex flex-col items-center">
                            <video ref={pcVideoRef} autoPlay playsInline className="w-full h-48 object-cover rounded-lg border-2 border-blue-400 mb-3 bg-black" />
                            <canvas ref={pcCanvasRef} className="hidden" />
                            <div className="flex gap-2 w-full">
                                <button type="button" onClick={capturePcCamera} className="flex-1 bg-blue-600 text-white font-bold py-2 rounded-lg">Capture</button>
                                <button type="button" onClick={cancelOcr} className="px-4 bg-slate-300 text-slate-700 font-bold rounded-lg">Cancel</button>
                            </div>
                        </div>
                    )}

                    {ocrMode === 'mobile' && mobileSessionId && (
                        <div className="flex flex-col items-center">
                            <p className="text-xs font-bold text-slate-500 mb-3 text-center">Scan with your phone to upload securely</p>
                            <div className="bg-white p-2 rounded-xl shadow-sm mb-3">
                                {/* Using 192.168.1.9 based on your prompt */}
                                <QRCodeSVG value={`http://192.168.1.9:3000/mobile-ocr/${mobileSessionId}`} size={120} />
                            </div>
                            <button type="button" onClick={cancelOcr} className="text-xs text-red-500 font-bold mt-2">Cancel Mobile Scan</button>
                        </div>
                    )}
                </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">{isMalaysian ? "IC Number *" : "Passport Number *"}</label>
                <input type="text" placeholder={isMalaysian ? "e.g. 900101-14-5533" : "Passport ID"} value={formData.ic} onChange={e => handleICChange(e.target.value)} className="w-full p-3 border rounded-lg outline-none font-mono uppercase" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Patient Full Name *</label>
                <input type="text" placeholder="Full Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})} className="w-full p-3 border rounded-lg outline-none uppercase" />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Home Address</label>
                <input type="text" placeholder="Full Address" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value.toUpperCase()})} className="w-full p-3 border rounded-lg outline-none uppercase" />
              </div>
              
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-1">Gender</label>
                  <select value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value.toUpperCase()})} className="w-full p-3 border rounded-lg outline-none bg-white uppercase">
                    <option value="MALE">MALE</option>
                    <option value="FEMALE">FEMALE</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-1">Nationality</label>
                  {isMalaysian ? (
                      <input type="text" readOnly value="MALAYSIA" className="w-full p-3 border bg-slate-50 rounded-lg outline-none font-bold text-slate-500 uppercase" />
                  ) : (
                      <>
                          <input list="countries" value={formData.nationality} onChange={e => setFormData({...formData, nationality: e.target.value.toUpperCase()})} placeholder="Type or select country" className="w-full p-3 border rounded-lg outline-none uppercase" />
                          <datalist id="countries">
                              {COUNTRIES.map(c => <option key={c} value={c.toUpperCase()} />)}
                          </datalist>
                      </>
                  )}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Phone Number *</label>
                <input type="text" placeholder={isMalaysian ? "012-3456789" : "+1 12345678911"} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-3 border rounded-lg outline-none font-mono" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t pt-4">
              <button onClick={() => { setShowModal(false); cancelOcr(); loadData(clinicId); }} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-medium hover:bg-slate-200 transition">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition">Save Patient</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}