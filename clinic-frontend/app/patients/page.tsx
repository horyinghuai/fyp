"use client";

import { useState, useEffect, useRef } from 'react';
import { Camera, FileUp } from 'lucide-react';
import { Eye, Calendar, X, AlertTriangle } from 'lucide-react';

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

  const [ocrMode, setOcrMode] = useState<'none'|'pc'>('none');
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const pcVideoRef = useRef<HTMLVideoElement>(null);
  const pcCanvasRef = useRef<HTMLCanvasElement>(null);

  const [isViewApptOpen, setIsViewApptOpen] = useState(false);
  const [selectedPatientAppts, setSelectedPatientAppts] = useState<any[]>([]);
  const [selectedApptDetail, setSelectedApptDetail] = useState<any>(null); 

  // --- NEW CANCEL APPOINTMENT STATES ---
  const [cancelApptModalVisible, setCancelApptModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState("Change of schedule");
  const [customCancelReason, setCustomCancelReason] = useState("");

  // --- NEW EDIT MODAL STATES (REPLICATED FROM TIMETABLE) ---
  const [doctors, setDoctors] = useState<any[]>([]);
  const [vaccinesList, setVaccinesList] = useState<any[]>([]);
  const [bloodTestsList, setBloodTestsList] = useState<any[]>([]);
  const [isEditingAppt, setIsEditingAppt] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editForm, setEditForm] = useState<any>({});
  const [inlineCancelReason, setInlineCancelReason] = useState("");

  const handleViewAppointments = async (patient: any) => {
    try {
        // Added ?include_canceled=true to the URL
        const res = await fetch(`http://127.0.0.1:8000/patient/${patient.clinic_id}/appointments/${patient.ic_passport_number}?include_canceled=true`);
        if (res.ok) {
            const data = await res.json();
            // Enrich with patient details for the modal
            const enrichedData = data.map((d: any) => ({
                ...d,
                patient_name: patient.name,
                patient_ic: patient.ic_passport_number
            }));
            // Sort by latest date first
            const sorted = enrichedData.sort((a: any, b: any) => 
                new Date(b.date).getTime() - new Date(a.date).getTime()
            );
            setSelectedPatientAppts(sorted);
            setIsViewApptOpen(true);
        }
    } catch (err) {
        alert("Failed to fetch appointments");
    }
  };

  // 3-Segment IC State
  const [icParts, setIcParts] = useState(['', '', '']);

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
        if (res.status === 401) { window.location.href = '/login'; return; }
        if (res.ok) setPatients(await res.json());

        // Load extra data for edit modal
        const docsRes = await fetch(`http://127.0.0.1:8000/admin/doctors-all/${cid}`);
        if (docsRes.ok) {
            const docs = await docsRes.json();
            const docsWithSched = await Promise.all(docs.map(async (d: any) => {
                const schedRes = await fetch(`http://127.0.0.1:8000/admin/doctors/${d.ic_passport_number}/availability/${cid}`);
                const schedules = schedRes.ok ? await schedRes.json() : [];
                return { ...d, schedules };
            }));
            setDoctors(docsWithSched);
        }
        const vacRes = await fetch(`http://127.0.0.1:8000/vaccines/${cid}`);
        if (vacRes.ok) setVaccinesList(await vacRes.json());
        
        const pkgsRes = await fetch(`http://127.0.0.1:8000/blood-tests/${cid}/package`);
        const pkgs = pkgsRes.ok ? await pkgsRes.json() : [];
        
        const sglsRes = await fetch(`http://127.0.0.1:8000/blood-tests/${cid}/single`);
        const sgls = sglsRes.ok ? await sglsRes.json() : [];
        
        setBloodTestsList([...pkgs, ...sgls]);
    } catch (err) {}
    setIsLoading(false);
  };

  const getAvailableSlots = () => {
      if (!editDate) return { times: [], docsForTime: {} };
      const dObj = new Date(editDate);
      const dayOfWeek = dObj.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
      const duration = editForm.service === 'Vaccine' ? 15 : 30;
      const now = new Date();
      const isToday = dObj.toDateString() === now.toDateString();

      const timesSet = new Set<string>();
      const docsForTime: Record<string, any[]> = {};

      doctors.forEach(doc => {
          if (editForm.doctor_ic && doc.ic_passport_number !== editForm.doctor_ic) return;
          if (!doc.schedules) return;
          const todayScheds = doc.schedules.filter((s: any) => s.day_of_week && s.day_of_week.toLowerCase() === dayOfWeek);
          
          todayScheds.forEach((sched: any) => {
              let curr = new Date(`${editDate}T${sched.start_time}`);
              const end = new Date(`${editDate}T${sched.end_time}`);
              
              while (new Date(curr.getTime() + duration*60000) <= end) {
                  const timeStr = curr.toTimeString().substring(0, 5);
                  const slotStart = new Date(curr);
                  const isCurrentEventTime = selectedApptDetail && selectedApptDetail.time.substring(0,5) === timeStr && selectedApptDetail.date === editDate;

                  if (isToday && slotStart <= now && !isCurrentEventTime) {
                      curr = new Date(curr.getTime() + duration*60000);
                      continue;
                  }

                  timesSet.add(timeStr);
                  if (!docsForTime[timeStr]) docsForTime[timeStr] = [];
                  if (!docsForTime[timeStr].some(d => d.ic_passport_number === doc.ic_passport_number)) {
                      docsForTime[timeStr].push(doc);
                  }
                  curr = new Date(curr.getTime() + duration*60000);
              }
          });
      });
      return { times: Array.from(timesSet).sort(), docsForTime };
  };

  const handleUpdateEvent = async () => {
      try {
          if (!editDate || !editTime || !editForm.doctor_ic) return alert("Please select Date, Time, and Doctor.");
          if (!window.confirm("Are you sure you want to save these changes?")) return;

          const scheduled_time = `${editDate} ${editTime}:00`;
          const payload: any = {
              appt_id: selectedApptDetail.appt_id, 
              service_type: editForm.service,
              details: {
                  items: editForm.items, dose: editForm.dose, total_doses: 1, assigned_doctor_id: editForm.doctor_ic, general_notes: editForm.reason
              },
              scheduled_time: scheduled_time, 
              status: editForm.status
          };
          
          if (editForm.status === 'canceled') {
              if (!inlineCancelReason.trim()) return alert("Please enter a cancel reason.");
              payload.cancel_reason = inlineCancelReason;
          }

          const updateRes = await fetch(`http://127.0.0.1:8000/update-appointment`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
          });
          
          if (!updateRes.ok) throw new Error('Update failed');
          window.location.reload(); 
      } catch (err: any) {
          alert(`Error: ${err.message}`);
      }
  };

  const handleICPartChange = (index: number, val: string) => {
      const clean = val.replace(/\D/g, '');
      const newParts = [...icParts];
      newParts[index] = clean;
      setIcParts(newParts);
      
      if (newParts[0].length === 6 && newParts[1].length === 2 && newParts[2].length === 4) {
          const gender = parseInt(newParts[2][3]) % 2 === 0 ? 'FEMALE' : 'MALE';
          setFormData({...formData, gender: gender, nationality: 'MALAYSIA'});
      }
  };

  const setICFromBackend = (icStr: string) => {
      const clean = icStr.replace(/\D/g, '');
      if (clean.length === 12) setIcParts([clean.substring(0,6), clean.substring(6,8), clean.substring(8,12)]);
  };

  const handleOcrFileResponse = async (blob: Blob) => {
      setOcrProcessing(true);
      const form = new FormData();
      form.append("file", blob, "mykad.jpg");
      try {
          const res = await fetch("http://127.0.0.1:8000/admin/ocr-mykad", { method: 'POST', body: form });
          const data = await res.json();
          if (data.success && data.data.ic) {
              setICFromBackend(data.data.ic);
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

  const restartPcCamera = async () => {
      if (pcVideoRef.current) {
          const oldStream = pcVideoRef.current.srcObject as MediaStream;
          oldStream?.getTracks().forEach(t => t.stop());
          pcVideoRef.current.srcObject = null;
      }
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
          if (pcVideoRef.current) {
              pcVideoRef.current.srcObject = stream;
              await new Promise(resolve => {
                  pcVideoRef.current!.onloadedmetadata = resolve;
              });
          }
      } catch(e) {
          alert("Failed to restart camera. Please try again.");
      }
  };

  const startPcCamera = async () => {
      setOcrMode('pc');
      try {
          // Stop any existing stream first
          if (pcVideoRef.current) {
              const oldStream = pcVideoRef.current.srcObject as MediaStream;
              oldStream?.getTracks().forEach(t => t.stop());
              pcVideoRef.current.srcObject = null;
          }
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
          if (pcVideoRef.current) {
              pcVideoRef.current.srcObject = stream;
              await new Promise(resolve => {
                  pcVideoRef.current!.onloadedmetadata = resolve;
              });
          }
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
                    const stream = video.srcObject as MediaStream;
                    stream?.getTracks().forEach(t => t.stop());
                    setICFromBackend(data.data.ic);
                    setFormData({...formData, ic: data.data.ic, name: data.data.name, address: data.data.address, gender: data.data.gender, nationality: 'MALAYSIA'});
                    setIsMyKadUploaded(true);
                    setOcrMode('none');
                    alert("MyKad scanned successfully!");
                } else { 
                    alert("Failed to read MyKad cleanly. Please adjust lighting and tap Capture again.");
                    // Ensure camera is active again after alert is dismissed
                    if (video.paused) {
                        video.play().catch(err => console.log("Could not resume video:", err));
                    }
                }
            })
            .catch(e => {
                alert("OCR Failed due to network connection.");
                // Ensure camera is active again after alert is dismissed
                if (video.paused) {
                    video.play().catch(err => console.log("Could not resume video:", err));
                }
            })
            .finally(() => setOcrProcessing(false));
      }, 'image/jpeg');
  };

  const cancelOcr = () => {
      if (ocrMode === 'pc') {
          const stream = pcVideoRef.current?.srcObject as MediaStream;
          stream?.getTracks().forEach(t => t.stop());
      }
      setOcrMode('none');
  };

  const handleSave = async () => {
    let finalIC = formData.ic;
    if (isMalaysian) {
        const [p1, p2, p3] = icParts;
        if (p1.length !== 6 || p2.length !== 2 || p3.length !== 4) return alert("⚠️ Malaysian IC must be exactly 12 digits completely filled.");
        if (p1 === '000000' || p2 === '00' || p3 === '0000') return alert("⚠️ Invalid IC format. Values of entirely zeroes are not allowed.");
        const mm = parseInt(p1.substring(2,4)), dd = parseInt(p1.substring(4,6));
        if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return alert("⚠️ Invalid date within the IC format.");
        finalIC = `${p1}-${p2}-${p3}`;
    }

    if (!finalIC) return alert("⚠️ IC / Passport Number is required.");
    if (!formData.name) return alert("⚠️ Patient Name is required.");
    if (!formData.phone) return alert("⚠️ Phone Number is required.");

    let finalPhone = formData.phone.trim();
    const phoneRegex = /^(\+60|0|60)?\d{2,3}-?\d{7,8}$/;
    if (!phoneRegex.test(finalPhone)) return alert("Invalid phone format! Please enter as +60XX-XXXXXXXX or XXX-XXXXXXXX.");
    
    let cleanDigits = finalPhone.replace(/[^\d]/g, '');
    if (cleanDigits.startsWith('60')) cleanDigits = cleanDigits.substring(2);
    else if (cleanDigits.startsWith('0')) cleanDigits = cleanDigits.substring(1);
    if (cleanDigits.length < 8 || cleanDigits.length > 10) return alert("Invalid phone length.");
    let prefix = cleanDigits.startsWith('11') || cleanDigits.startsWith('15') ? cleanDigits.substring(0, 3) : cleanDigits.substring(0, 2);
    let suffix = cleanDigits.startsWith('11') || cleanDigits.startsWith('15') ? cleanDigits.substring(3) : cleanDigits.substring(2);
    finalPhone = `+60${prefix}-${suffix}`;

    if (!window.confirm("Are you sure this details are correct?")) return;

    try {
        const token = localStorage.getItem('aicas_token');
        const isEditing = !!editingPatient;
        const url = isEditing ? `http://127.0.0.1:8000/admin/patients/${editingPatient.id}` : `http://127.0.0.1:8000/register-patient`;
        
        const payload = isEditing ? { 
            ic_passport_number: finalIC.toUpperCase(), name: formData.name.toUpperCase(), phone: finalPhone, 
            gender: formData.gender.toUpperCase(), nationality: formData.nationality.toUpperCase(), address: formData.address.toUpperCase() 
        } : { 
            clinic_id: clinicId, ic_passport_number: finalIC.toUpperCase(), name: formData.name.toUpperCase(), 
            phone: finalPhone, gender: formData.gender.toUpperCase(), nationality: formData.nationality.toUpperCase(), address: formData.address.toUpperCase() 
        };

        const res = await fetch(url, { method: isEditing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload) });
        if (res.status === 401) return window.location.href = '/login';
        if (res.status === 409) { const errData = await res.json(); return alert("⚠️ " + errData.detail); }
        
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
        if (isMy) setICFromBackend(patient.ic_passport_number);
        setFormData({ ic: patient.ic_passport_number, name: patient.name, phone: patient.phone, gender: patient.gender, nationality: patient.nationality, address: patient.address || '' });
    } else {
        setIsMalaysian(true);
        setIcParts(['', '', '']);
        setFormData({ ic: '', name: '', phone: '', gender: 'MALE', nationality: 'MALAYSIA', address: '' });
    }
    setShowModal(true);
  };

  if (isLoading) return <div className="animate-pulse h-64 bg-slate-200 rounded-2xl"></div>;

  const executeCancellation = async () => {
    const reason = cancelReason === "Other" ? customCancelReason : cancelReason;
    if (!reason.trim()) return alert("Please provide a cancellation reason.");
    if (!selectedApptDetail) return alert("Error: No appointment selected.");

    if (!window.confirm("Are you sure you want to cancel this booking?")) return;

    try {
        const cancelRes = await fetch(`http://127.0.0.1:8000/admin/appointment-stages/${selectedApptDetail.stage_id || selectedApptDetail.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'canceled', cancel_reason: reason })
        });

        if (!cancelRes.ok) throw new Error('Cancellation failed');

        window.location.reload();
    } catch (err: any) {
        alert(`Error: ${err.message}`);
    }
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
            {patients.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.ic_passport_number.includes(search)).length === 0 && !isLoading && (
                <tr key="empty-patients"><td colSpan={4} className="p-8 text-center text-slate-500 font-medium">[No patient found]</td></tr>
            )}
            {patients.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.ic_passport_number.includes(search)).map((p, i) => (
              <tr key={p.id || `patient-${i}`} className={`border-b border-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                <td className="p-4">
                  <div className="font-bold text-slate-800">{p.name}</div>
                  <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full">{p.gender}</span>
                  <span className="text-xs text-slate-500 ml-2">{p.nationality}</span>
                </td>
                <td className="p-4 font-mono text-slate-600">{p.ic_passport_number}</td>
                <td className="p-4 text-slate-600">{p.phone}</td>
                <td className="p-4 text-center space-x-2">
                  <button onClick={() => handleViewAppointments(p)} className="px-3 py-1 bg-blue-100 text-blue-600 rounded text-sm font-medium hover:bg-blue-200" title="View Appointments">View Appointments</button>
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
                <button onClick={() => { setIsMalaysian(true); setIcParts(['','','']); setFormData({...formData, nationality: 'MALAYSIA', ic: '', phone: ''}); setIsMyKadUploaded(false); }} className={`flex-1 py-1 text-sm font-bold rounded ${isMalaysian ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Malaysian</button>
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
                        </div>
                    )}
                    {ocrProcessing && <p className="text-blue-600 font-bold text-sm text-center py-4 animate-pulse">Analyzing MyKad with AI...</p>}
                    {ocrMode === 'pc' && !ocrProcessing && (
                        <div className="flex flex-col items-center">
                            <video ref={pcVideoRef} autoPlay playsInline className="w-full h-48 object-cover rounded-lg border-2 border-blue-400 mb-3 bg-black" />
                            <canvas ref={pcCanvasRef} className="hidden" />
                            <div className="flex gap-2 w-full">
                                <button type="button" onClick={capturePcCamera} className="flex-1 bg-blue-600 text-white font-bold py-2 rounded-lg">Capture</button>
                                <button type="button" onClick={restartPcCamera} className="flex-1 bg-amber-500 text-white font-bold py-2 rounded-lg">Refresh</button>
                                <button type="button" onClick={cancelOcr} className="px-4 bg-slate-300 text-slate-700 font-bold rounded-lg">Cancel</button>
                            </div>
                        </div>
                    )}

                </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">{isMalaysian ? "IC Number *" : "Passport Number *"}</label>
                {isMalaysian ? (
                    <div className="flex gap-2 items-center bg-white border rounded-lg px-2 focus-within:ring-2 focus-within:ring-blue-500">
                        <input type="text" placeholder="YYMMDD" maxLength={6} value={icParts[0]} onChange={e => handleICPartChange(0, e.target.value)} className="w-[40%] bg-transparent p-2 outline-none font-mono text-center" />
                        <span className="text-slate-400 font-bold">-</span>
                        <input type="text" placeholder="XX" maxLength={2} value={icParts[1]} onChange={e => handleICPartChange(1, e.target.value)} className="w-[20%] bg-transparent p-2 outline-none font-mono text-center" />
                        <span className="text-slate-400 font-bold">-</span>
                        <input type="text" placeholder="XXXX" maxLength={4} value={icParts[2]} onChange={e => handleICPartChange(2, e.target.value)} className="w-[40%] bg-transparent p-2 outline-none font-mono text-center" />
                    </div>
                ) : (
                    <input type="text" placeholder="Passport ID" value={formData.ic} onChange={e => setFormData({...formData, ic: e.target.value.toUpperCase()})} className="w-full p-3 border rounded-lg outline-none font-mono uppercase" />
                )}
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
                    <option value="MALE">MALE</option><option value="FEMALE">FEMALE</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-1">Nationality</label>
                  {isMalaysian ? (
                      <input type="text" readOnly value="MALAYSIA" className="w-full p-3 border bg-slate-50 rounded-lg outline-none font-bold text-slate-500 uppercase" />
                  ) : (
                      <>
                          <input list="countries" value={formData.nationality} onChange={e => setFormData({...formData, nationality: e.target.value.toUpperCase()})} placeholder="Type or select country" className="w-full p-3 border rounded-lg outline-none uppercase" />
                          <datalist id="countries">{COUNTRIES.map(c => <option key={c} value={c.toUpperCase()} />)}</datalist>
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

      {/* 1. APPOINTMENTS LIST MODAL */}
      {isViewApptOpen && !selectedApptDetail && (
          <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm">
              <div className="bg-white p-6 rounded-2xl w-[900px] shadow-2xl max-h-[90vh] flex flex-col">
                  <div className="flex justify-between items-center mb-4 border-b pb-4">
                      <h3 className="text-xl font-bold text-slate-800">Patient Appointments</h3>
                      <button onClick={() => setIsViewApptOpen(false)} className="text-slate-400 hover:text-red-500"><X size={20}/></button>
                  </div>
                  <div className="overflow-y-auto flex-1">
                      <table className="w-full text-left border-collapse">
                          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                              <tr>
                                  <th className="p-3 font-semibold text-slate-600 text-sm">Date & Time</th>
                                  <th className="p-3 font-semibold text-slate-600 text-sm">Service Type</th>
                                  <th className="p-3 font-semibold text-slate-600 text-sm">Service Details</th>
                                  <th className="p-3 font-semibold text-slate-600 text-sm">Doctor</th>
                                  <th className="p-3 font-semibold text-slate-600 text-sm">Status</th>
                                  <th className="p-3 font-semibold text-slate-600 text-sm text-center">Action</th>
                              </tr>
                          </thead>
                          <tbody>
                              {selectedPatientAppts.length === 0 && (
                                  <tr key="empty-appts"><td colSpan={6} className="p-8 text-center text-slate-500 italic">No appointments found.</td></tr>
                              )}
                              {selectedPatientAppts.map((appt, i) => (
                                  <tr key={appt.id || `appt-${i}`} className={`border-b border-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-slate-100`}>
                                      <td className="p-3 text-sm">
                                          <div className="font-bold text-slate-800">{new Date(appt.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                                          <div className="text-slate-500 font-mono">{appt.time.substring(0, 5)}</div>
                                      </td>
                                      <td className="p-3 text-sm font-medium">{appt.service}</td>
                                      <td className="p-3 text-sm text-slate-600 max-w-[200px] truncate" title={appt.service === 'Vaccine' ? `${appt.details?.items?.[0] || ''} (${appt.details?.dose || ''})` : appt.service === 'Blood Test' ? appt.details?.items?.join(', ') : appt.details?.reason}>
                                          {appt.service === 'Vaccine' ? `${appt.details?.items?.[0] || ''} (${appt.details?.dose || ''})` : appt.service === 'Blood Test' ? appt.details?.items?.join(', ') : appt.details?.reason}
                                          {appt.status === 'canceled' && appt.cancel_reason && (
                                              <span className="text-red-500 font-medium ml-1">(Canceled)</span>
                                          )}
                                      </td>
                                      <td className="p-3 text-sm text-slate-600">{appt.doctor_name}</td>
                                      <td className="p-3 text-sm">
                                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${appt.status === 'scheduled' ? 'bg-blue-100 text-blue-700' : appt.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : appt.status === 'canceled' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700'}`}>
                                              {appt.status}
                                          </span>
                                      </td>
                                      <td className="p-3 text-center">
                                          <button onClick={() => setSelectedApptDetail(appt)} className="px-3 py-1.5 bg-blue-50 border border-blue-100 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 transition">View Details</button>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
          </div>
      )}

      {/* 2. TIMETABLE STYLE BOOKING DETAILS MODAL */}
      {selectedApptDetail && !cancelApptModalVisible && (
          <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[60] backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-2xl w-[500px] overflow-hidden max-h-[90vh] overflow-y-auto">
                  <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
                      <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                          <Calendar size={18}/> Booking Details
                      </h3>
                      <button onClick={() => { setSelectedApptDetail(null); setIsEditingAppt(false); }} className="text-slate-400 hover:text-red-500"><X size={20}/></button>
                  </div>

                  <div className="p-6">
                      {isEditingAppt ? (
                          <div className="space-y-4">
                              {/* Service Type */}
                              <div>
                                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Service Type</label>
                                  <select value={editForm.service} onChange={(e) => setEditForm({...editForm, service: e.target.value, items: [], doctor_ic: ''})} className="w-full p-2 border rounded-lg bg-white outline-none">
                                      <option value="Others">Others</option>
                                      <option value="Vaccine">Vaccine</option>
                                      <option value="Blood Test">Blood Test</option>
                                  </select>
                              </div>

                              {/* Status */}
                              <div>
                                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Booking Status</label>
                                  <select value={editForm.status} onChange={(e) => setEditForm({...editForm, status: e.target.value})} className="w-full p-2 border rounded-lg bg-white outline-none mb-2">
                                      <option value="scheduled">Scheduled</option>
                                      <option value="completed">Completed</option>
                                      <option value="no-show">No-Show</option>
                                      <option value="canceled">Canceled</option>
                                  </select>
                                  {editForm.status === 'canceled' && (
                                      <div className="mt-2">
                                          <label className="block text-xs font-bold text-red-500 uppercase mb-1">Cancellation Reason *</label>
                                          <input 
                                              type="text" 
                                              value={inlineCancelReason} 
                                              onChange={e => setInlineCancelReason(e.target.value)} 
                                              className="w-full p-2 border rounded-lg bg-white outline-none border-red-300" 
                                              placeholder="Specify reason..." 
                                          />
                                      </div>
                                  )}
                              </div>

                              {/* Doctor */}
                              <div>
                                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Assigned Doctor *</label>
                                  <select value={editForm.doctor_ic} onChange={(e) => { setEditForm({...editForm, doctor_ic: e.target.value}); setEditDate(""); setEditTime(""); }} className="w-full p-2 border rounded-lg bg-white outline-none">
                                      <option value="">-- Select a Doctor --</option>
                                      {doctors.map((doc: any) => <option key={doc.ic_passport_number} value={doc.ic_passport_number}>{doc.name}</option>)}
                                  </select>
                              </div>

                              {/* Date */}
                              <div>
                                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Date</label>
                                  <input type="date" value={editDate} onChange={e => { setEditDate(e.target.value); setEditTime(""); }} className="w-full p-2 border rounded-lg bg-white outline-none" />
                              </div>

                              {/* Time */}
                              {editDate && editForm.doctor_ic && (
                                  <div>
                                      <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Time</label>
                                      <div className="grid grid-cols-4 gap-2">
                                          {getAvailableSlots().times.map((t: string) => (
                                              <button key={t} type="button" onClick={() => setEditTime(t)}
                                                  className={`p-2 border rounded-lg text-sm transition-all flex flex-col items-center justify-center ${editTime === t ? "bg-indigo-600 text-white border-indigo-600 shadow-md font-bold" : "bg-slate-50 text-slate-700 hover:bg-indigo-50 border-slate-200"}`}>
                                                  <span>{t}</span>
                                              </button>
                                          ))}
                                          {getAvailableSlots().times.length === 0 && <div className="col-span-4 text-sm text-slate-500 text-center py-2">No available slots.</div>}
                                      </div>
                                  </div>
                              )}
                          </div>
                      ) : (
                          <dl className="space-y-2.5 text-sm">
                              <div className="flex gap-3">
                                  <dt className="w-28 shrink-0 font-semibold text-slate-400 uppercase text-[11px] tracking-wide pt-0.5">Patient</dt>
                                  <dd className="text-slate-800 font-bold">{selectedApptDetail.patient_name}</dd>
                              </div>
                              <div className="flex gap-3">
                                  <dt className="w-28 shrink-0 font-semibold text-slate-400 uppercase text-[11px] tracking-wide pt-0.5">Service</dt>
                                  <dd className="text-slate-800 font-medium">{selectedApptDetail.service}</dd>
                              </div>

                              {selectedApptDetail.service === 'Vaccine' && (
                                  <>
                                      <div className="flex gap-3">
                                          <dt className="w-28 shrink-0 font-semibold text-slate-400 uppercase text-[11px] tracking-wide pt-0.5">Vaccine</dt>
                                          <dd className="text-slate-800">{selectedApptDetail.details?.items?.[0] || '—'}</dd>
                                      </div>
                                      <div className="flex gap-3">
                                          <dt className="w-28 shrink-0 font-semibold text-slate-400 uppercase text-[11px] tracking-wide pt-0.5">Dose</dt>
                                          <dd className="text-slate-800">{selectedApptDetail.details?.dose || '—'}</dd>
                                      </div>
                                  </>
                              )}

                              {selectedApptDetail.service === 'Blood Test' && (
                                  <div className="flex gap-3">
                                      <dt className="w-28 shrink-0 font-semibold text-slate-400 uppercase text-[11px] tracking-wide pt-0.5">Tests</dt>
                                      <dd className="text-slate-800">{selectedApptDetail.details?.items?.join(', ') || '—'}</dd>
                                  </div>
                              )}

                              {selectedApptDetail.service === 'Others' && (
                                  <div className="flex gap-3">
                                      <dt className="w-28 shrink-0 font-semibold text-slate-400 uppercase text-[11px] tracking-wide pt-0.5">Reason</dt>
                                      <dd className="text-slate-800">{selectedApptDetail.details?.reason || '—'}</dd>
                                  </div>
                              )}

                              <div className="flex gap-3">
                                  <dt className="w-28 shrink-0 font-semibold text-slate-400 uppercase text-[11px] tracking-wide pt-0.5">Doctor</dt>
                                  <dd className="text-slate-800">{selectedApptDetail.doctor_name || 'ANY'}</dd>
                              </div>
                              <div className="flex gap-3">
                                  <dt className="w-28 shrink-0 font-semibold text-slate-400 uppercase text-[11px] tracking-wide pt-0.5">Date</dt>
                                  <dd className="text-slate-800">{new Date(selectedApptDetail.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })} ({new Date(selectedApptDetail.date).toLocaleDateString('en-GB', { weekday: 'short' })})</dd>
                              </div>
                              <div className="flex gap-3">
                                  <dt className="w-28 shrink-0 font-semibold text-slate-400 uppercase text-[11px] tracking-wide pt-0.5">Time</dt>
                                  <dd className="text-slate-800 font-mono">{selectedApptDetail.time.substring(0, 5)}</dd>
                              </div>
                              <div className="flex gap-3 items-start">
                                  <dt className="w-28 shrink-0 font-semibold text-slate-400 uppercase text-[11px] tracking-wide pt-0.5">Status</dt>
                                  <dd>
                                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${selectedApptDetail.status === 'scheduled' ? 'bg-blue-100 text-blue-700' : selectedApptDetail.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : selectedApptDetail.status === 'canceled' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700'}`}>
                                          {selectedApptDetail.status.charAt(0).toUpperCase() + selectedApptDetail.status.slice(1)}
                                      </span>
                                  </dd>
                              </div>

                              {selectedApptDetail.status === 'canceled' && selectedApptDetail.cancel_reason && (
                                  <div className="flex gap-3 pt-2">
                                      <dt className="w-28 shrink-0 font-semibold text-slate-400 uppercase text-[11px] tracking-wide pt-0.5">Cancel Reason</dt>
                                      <dd className="text-red-600 font-medium">{selectedApptDetail.cancel_reason}</dd>
                                  </div>
                              )}
                          </dl>
                      )}
                  </div>
                  
                  <div className="px-6 py-4 bg-slate-50 flex justify-between gap-3 border-t border-slate-100">
                      {isEditingAppt ? (
                          <button onClick={() => setIsEditingAppt(false)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300">Cancel Modify</button>
                      ) : (
                          <button
                              onClick={() => setCancelApptModalVisible(true)}
                              disabled={['completed', 'canceled', 'no-show'].includes(selectedApptDetail.status)}
                              className={`px-4 py-2 rounded-lg font-medium transition-colors ${['completed', 'canceled', 'no-show'].includes(selectedApptDetail.status) ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
                          >
                              Cancel Booking
                          </button>
                      )}
                      
                      {isEditingAppt ? (
                          <button onClick={handleUpdateEvent} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium">Save Changes</button>
                      ) : (
                          <button
                              onClick={() => {
                                  setEditDate(selectedApptDetail.date);
                                  setEditTime(selectedApptDetail.time.substring(0,5));
                                  setEditForm({
                                      status: selectedApptDetail.status,
                                      doctor_ic: selectedApptDetail.doctor_ic || (doctors.length > 0 ? doctors[0].ic_passport_number : ''),
                                      service: selectedApptDetail.service,
                                      items: selectedApptDetail.details?.items || [],
                                      dose: selectedApptDetail.details?.dose || '',
                                      reason: selectedApptDetail.details?.reason || ''
                                  });
                                  setInlineCancelReason(selectedApptDetail.cancel_reason || "");
                                  setIsEditingAppt(true);
                              }}
                              disabled={['completed', 'canceled', 'no-show'].includes(selectedApptDetail.status)}
                              className={`px-4 py-2 rounded-lg font-medium ${['completed', 'canceled', 'no-show'].includes(selectedApptDetail.status) ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                          >
                              Modify Booking
                          </button>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* 3. CANCEL REASON MODAL (Exact match to Timetable) */}
      {cancelApptModalVisible && (
          <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[70] backdrop-blur-sm">
              <div className="bg-white p-6 rounded-2xl shadow-2xl w-[400px]">
                  <h3 className="font-bold text-lg text-slate-800 mb-4">Cancel Booking</h3>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Reason for Cancellation</label>
                  <select value={cancelReason} onChange={e => setCancelReason(e.target.value)} className="w-full p-2 border rounded-lg bg-white mb-4 outline-none">
                      <option value="Change of schedule">Change of schedule</option>
                      <option value="Feeling better">Feeling better</option>
                      <option value="Booked wrong service">Booked wrong service</option>
                      <option value="Personal reasons">Personal reasons</option>
                      <option value="Other">Other (Custom)</option>
                  </select>
                  {cancelReason === "Other" && (
                      <input type="text" placeholder="Specify reason..." value={customCancelReason} onChange={e => setCustomCancelReason(e.target.value)} className="w-full p-2 border rounded-lg mb-4 outline-none" />
                  )}
                  <div className="flex justify-end gap-3">
                      <button onClick={() => setCancelApptModalVisible(false)} className="px-4 py-2 bg-slate-100 rounded-lg text-slate-700 font-medium">Back</button>
                      <button onClick={executeCancellation} className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium">Confirm Cancel</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}