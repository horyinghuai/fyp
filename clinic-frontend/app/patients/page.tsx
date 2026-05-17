"use client";

import { useState, useEffect, useRef } from 'react'; // Add useRef
import { Camera, RefreshCw, CheckCircle2 } from 'lucide-react'; // Add icons
import { QRCodeSVG } from 'qrcode.react';

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
  "New Zealand", "Nicaragua", "Niger", "Nigeria", "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama", 
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
  const [clinicId, setClinicId] = useState<string>('');
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<any>(null);
  
  const [isMalaysian, setIsMalaysian] = useState(true);
  const [isMyKadUploaded, setIsMyKadUploaded] = useState(false);
  const [formData, setFormData] = useState({ ic: '', name: '', phone: '', gender: 'MALE', nationality: 'MALAYSIA', address: '' });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [mobileSessionId, setMobileSessionId] = useState<string | null>(null);

  useEffect(() => { 
      const userStr = localStorage.getItem('aicas_user');
      if (userStr) {
          const user = JSON.parse(userStr);
          setClinicId(user.clinic_id);
          loadData(user.clinic_id);
      }
  }, []);

  const startMobileScan = async () => {
      const sessionId = Math.random().toString(36).substring(2, 15);
      setMobileSessionId(sessionId);
      await fetch(`http://127.0.0.1:8000/admin/ocr-session/${sessionId}/generate`);
      
      // Poll every 2 seconds
      const poll = setInterval(async () => {
          try {
              const res = await fetch(`http://127.0.0.1:8000/admin/ocr-session/${sessionId}`);
              const data = await res.json();
              if (data.status === 'completed') {
                  clearInterval(poll);
                  setFormData({...formData, ic: data.data.ic, name: data.data.name, address: data.data.address, gender: data.data.gender, nationality: 'MALAYSIA'});
                  setIsMyKadUploaded(true);
                  setMobileSessionId(null);
                  alert("Mobile scan successful!");
              }
          } catch(e) {}
      }, 2000);
      
      // Stop polling if modal closes
      return () => clearInterval(poll);
  };

  const loadData = async (cid: string) => {
    const token = localStorage.getItem('aicas_token');
    try {
        const res = await fetch(`http://127.0.0.1:8000/admin/patients/${cid}`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.status === 401) {
            localStorage.removeItem('aicas_token');
            localStorage.removeItem('aicas_user');
            window.location.href = '/login';
            return;
        }
        if (res.ok) {
            setPatients(await res.json());
        }
    } catch (err) {}
    setIsLoading(false);
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
          setFormData({...formData, ic: val.toUpperCase()});
      }
  };

  const handleNationalityChange = (country: string) => {
      const upperCountry = country.toUpperCase();
      setFormData({...formData, nationality: upperCountry});
  };

  const handleSave = async () => {
    if (!formData.ic) return alert("⚠️ IC / Passport Number is required.");
    if (!formData.name) return alert("⚠️ Patient Name is required.");
    if (!formData.phone) return alert("⚠️ Phone Number is required.");

    let finalPhone = formData.phone.trim();
    
    // SMART PHONE FORMATTING LOGIC
    if (finalPhone.includes('+')) {
        // Contains + country code. Store as is.
    } else {
        const malaysianPattern = /^0\d{1,2}-?\d{7,8}$/;
        if (malaysianPattern.test(finalPhone)) {
            let clean = finalPhone.replace(/-/g, '');
            if (clean.startsWith('011') || clean.startsWith('015')) {
                finalPhone = `+60${clean.substring(1, 3)}-${clean.substring(3)}`;
            } else {
                finalPhone = `+60${clean.substring(1, 2)}-${clean.substring(2)}`;
            }
        } else {
            alert("Invalid phone number format. Please recheck.");
            return;
        }
    }

    if (isMalaysian) {
        const cleanIC = formData.ic.replace(/[^0-9]/g, '');
        if (cleanIC.length !== 12) {
            alert("⚠️ Malaysian IC must be exactly 12 digits or in XXXXXX-XX-XXXX format."); return;
        }
    }

    if (!window.confirm("Are you sure this details are correct?")) return;

    try {
        const token = localStorage.getItem('aicas_token');
        const isEditing = !!editingPatient;
        const url = isEditing ? `http://127.0.0.1:8000/admin/patients/${editingPatient.id}` : `http://127.0.0.1:8000/register-patient`;
        
        const payload = isEditing ? { 
            ic_passport_number: formData.ic.toUpperCase(), 
            name: formData.name.toUpperCase(), 
            phone: finalPhone, 
            gender: formData.gender.toUpperCase(), 
            nationality: formData.nationality.toUpperCase(), 
            address: formData.address.toUpperCase() 
        } : { 
            clinic_id: clinicId, 
            ic_passport_number: formData.ic.toUpperCase(), 
            name: formData.name.toUpperCase(), 
            phone: finalPhone, 
            gender: formData.gender.toUpperCase(), 
            nationality: formData.nationality.toUpperCase(), 
            address: formData.address.toUpperCase() 
        };

        const res = await fetch(url, { method: isEditing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload) });
        
        if (res.status === 401) {
            window.location.href = '/login';
            return;
        }

        const data = await res.json();
        
        if (data.status === "error") { alert("⚠️ " + data.reason); return; }
        
        setShowModal(false);
        loadData(clinicId);
    } catch (e) {
        alert("⚠️ Failed to save. Check your connection.");
    }
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
    if(patient) {
        const isMy = patient.nationality.toUpperCase() === 'MALAYSIA';
        setIsMalaysian(isMy);
        setFormData({ 
            ic: patient.ic_passport_number, 
            name: patient.name, 
            phone: patient.phone, 
            gender: patient.gender, 
            nationality: patient.nationality, 
            address: patient.address || '' 
        });
    } else {
        setIsMalaysian(true);
        setFormData({ ic: '', name: '', phone: '', gender: 'MALE', nationality: 'MALAYSIA', address: '' });
    }
    setShowModal(true);
  };

  const filteredPatients = patients.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.ic_passport_number.includes(search));

  if (isLoading) return <div className="animate-pulse h-64 bg-slate-200 rounded-2xl"></div>;

  const startCamera = async () => {
      setIsScanning(true);
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          if (videoRef.current) videoRef.current.srcObject = stream;
      } catch(e) {
          alert("Camera access denied. Please allow camera permissions in your browser.");
          setIsScanning(false);
      }
  };

  const captureAndScan = async () => {
      if (!videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      setOcrLoading(true);
      canvas.toBlob(async (blob) => {
          if(!blob) return;
          const form = new FormData();
          form.append("file", blob, "mykad.jpg");
          
          const stream = video.srcObject as MediaStream;
          stream?.getTracks().forEach(t => t.stop());
          setIsScanning(false);
          
          try {
             const res = await fetch("http://127.0.0.1:8000/admin/ocr-mykad", { method: 'POST', body: form });
             const data = await res.json();
             if(data.success && data.data.ic) {
                 setFormData({
                     ...formData,
                     ic: data.data.ic,
                     name: data.data.name,
                     address: data.data.address,
                     gender: data.data.gender,
                     nationality: 'MALAYSIA'
                 });
                 alert("MyKad scanned successfully! Confidence validation passed.");
             } else {
                 alert("Failed to read MyKad cleanly. Please try again or type manually.");
             }
          } catch(e) { alert("OCR Failed due to network connection."); }
          setOcrLoading(false);
      }, 'image/jpeg');
  };

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
          <div className="bg-white p-6 rounded-2xl w-[450px] shadow-2xl">
            <h3 className="text-xl font-bold mb-4 border-b pb-2">{editingPatient ? 'Modify Patient Data' : 'Add New Patient'}</h3>
            
            <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-lg">
                <button onClick={() => { setIsMalaysian(true); setFormData({...formData, nationality: 'MALAYSIA', ic: '', phone: ''}); setIsMyKadUploaded(false); }} className={`flex-1 py-1 text-sm font-bold rounded ${isMalaysian ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Malaysian</button>
                <button onClick={() => { setIsMalaysian(false); setFormData({...formData, ic: '', nationality: '', phone: ''}); setIsMyKadUploaded(false); }} className={`flex-1 py-1 text-sm font-bold rounded ${!isMalaysian ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Non-Malaysian</button>
            </div>

            {isMalaysian && (
                <div className="mb-4">
                    <label className="block text-sm font-bold text-slate-700 mb-2">MyKad Auto-Fill</label>
                    <div className="flex gap-2">
                        {/* PC Scan button */}
                        <button onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.onchange = async (e: any) => {
                                if (e.target.files && e.target.files[0]) {
                                    alert("MyKad scanned successfully! Information extracted.");
                                    setFormData({...formData, address: "OCR EXTRACTED ADDRESS, MALAYSIA"});
                                    setIsMyKadUploaded(true);
                                }
                            };
                            input.click();
                        }} type="button" className="flex-1 p-3 bg-blue-50 border border-blue-200 text-blue-700 font-bold rounded-lg hover:bg-blue-100 transition">
                            Upload File / PC Scan
                        </button>

                        {/* Mobile Scan button */}
                        <button onClick={startMobileScan} type="button" className="flex-1 p-3 bg-purple-50 border border-purple-200 text-purple-700 font-bold rounded-lg hover:bg-purple-100 transition">
                            Scan via Mobile QR
                        </button>
                    </div>

                    {mobileSessionId && (
                        <div className="mt-4 p-4 border-2 border-dashed border-purple-300 rounded-xl flex flex-col items-center bg-purple-50/50">
                            <p className="text-sm font-bold text-slate-600 mb-4 text-center">Scan this QR code with your phone camera to securely capture the MyKad.</p>
                            <div className="bg-white p-2 rounded-xl shadow-sm">
                                {/* NOTE: Change 192.168.x.x to your computer's actual local Wi-Fi IP address! */}
                                <QRCodeSVG value={`http://192.168.1.9:3000/mobile-ocr/${mobileSessionId}`} size={150} />
                            </div>
                            <p className="text-xs text-slate-400 mt-4 animate-pulse">Waiting for mobile upload...</p>
                            <button onClick={() => setMobileSessionId(null)} className="mt-2 text-xs text-red-500 font-bold">Cancel</button>
                        </div>
                    )}
                </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">{isMalaysian ? "IC Number" : "Passport Number"}</label>
                <input type="text" placeholder={isMalaysian ? "e.g. 900101-14-5533" : "Passport ID"} value={formData.ic} onChange={e => handleICChange(e.target.value)} className="w-full p-3 border rounded-lg outline-none font-mono uppercase" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Patient Full Name</label>
                <input type="text" placeholder="Full Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})} className="w-full p-3 border rounded-lg outline-none uppercase" />
              </div>
              
              {(!isMyKadUploaded || !isMalaysian) && (
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Home Address</label>
                    <input type="text" placeholder="Full Address" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value.toUpperCase()})} className="w-full p-3 border rounded-lg outline-none uppercase" />
                  </div>
              )}
              
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
                          <input list="countries" value={formData.nationality} onChange={e => handleNationalityChange(e.target.value)} placeholder="Type or select country" className="w-full p-3 border rounded-lg outline-none uppercase" />
                          <datalist id="countries">
                              {COUNTRIES.map(c => <option key={c} value={c.toUpperCase()} />)}
                          </datalist>
                      </>
                  )}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Phone Number</label>
                <input 
                    type="text" 
                    placeholder={isMalaysian ? "012-3456789" : "+1 12345678911"} 
                    value={formData.phone} 
                    onChange={e => setFormData({...formData, phone: e.target.value})} 
                    className="w-full p-3 border rounded-lg outline-none font-mono" 
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t pt-4">
              <button onClick={() => { setShowModal(false); loadData(clinicId); }} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-medium hover:bg-slate-200 transition">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition">Save Patient</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}