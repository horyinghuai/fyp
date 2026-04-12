"use client";

import { useState, useEffect } from 'react';
import { Calendar, momentLocalizer, View } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { X, User, Droplet, Activity, Calendar as CalIcon, AlertTriangle } from 'lucide-react';

const localizer = momentLocalizer(moment);
const CLINIC_ID = "c1111111-1111-1111-1111-111111111111"; 

export default function AdminDashboard() {
  const [events, setEvents] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [vaccinesList, setVaccinesList] = useState<any[]>([]);
  const [bloodTestsList, setBloodTestsList] = useState<any[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [stats, setStats] = useState({ total: 0, vaccines: 0, bloodTests: 0 });
  
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [isEditingEvent, setIsEditingEvent] = useState(false);
  
  const [isNewBooking, setIsNewBooking] = useState(false);
  const [isCreatingNewPatient, setIsCreatingNewPatient] = useState(false);
  const [newPatientForm, setNewPatientForm] = useState({ name: '', ic_passport_number: '', phone: '', gender: 'MALE', nationality: 'MALAYSIA', address: '' });
  
  // Status check pop-up state
  const [pendingReviewEvent, setPendingReviewEvent] = useState<any>(null);

  // Filters State
  const [filters, setFilters] = useState({ scheduled: true, completed: true, canceled: false, noShow: true });

  const [editForm, setEditForm] = useState({
    status: 'scheduled', scheduled_time: '', doctor_ic: '', patient_ic: '',
    service: 'Consultation', items: [] as string[], dose: 'Single Dose', reason: ''
  });

  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<View>('week'); 

  useEffect(() => { 
    loadAppointments();
    loadDoctors(); 
    loadPatients();
    loadServices();
  }, []);

  // Time passed interval checker for pop-up
  useEffect(() => {
    const interval = setInterval(() => {
        if (!events.length || pendingReviewEvent) return;
        const now = new Date();
        const passedEvent = events.find(e => 
            e.status === 'scheduled' && 
            e.end < now && 
            e.end.toDateString() === now.toDateString() // Restrict to today's events so it doesn't trigger for old history
        );
        if (passedEvent) {
            setPendingReviewEvent(passedEvent);
        }
    }, 15000); 
    return () => clearInterval(interval);
  }, [events, pendingReviewEvent]);

  const loadDoctors = () => fetch(`http://127.0.0.1:8000/doctors/${CLINIC_ID}`).then(res => res.json()).then(setDoctors);
  const loadPatients = () => fetch(`http://127.0.0.1:8000/admin/patients/${CLINIC_ID}`).then(res => res.json()).then(setPatients);

  const loadServices = async () => {
    const vRes = await fetch(`http://127.0.0.1:8000/vaccines/${CLINIC_ID}`);
    setVaccinesList(await vRes.json());
    
    const pkgs = await (await fetch(`http://127.0.0.1:8000/blood-tests/${CLINIC_ID}/package`)).json();
    const sgls = await (await fetch(`http://127.0.0.1:8000/blood-tests/${CLINIC_ID}/single`)).json();
    setBloodTestsList([...pkgs, ...sgls]);
  };

  const loadAppointments = () => {
    fetch(`http://127.0.0.1:8000/admin/appointments/${CLINIC_ID}`)
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(data => {
        if (!Array.isArray(data) || data.length === 0) { 
            setEvents([]); setIsLoading(false); return; 
        }

        let vacCount = 0, btCount = 0;
        const formattedEvents = data.map((appt: any) => {
          if (appt.service === "Vaccine") vacCount++;
          if (appt.service === "Blood Test") btCount++;
          
          let detailsText = appt.reason || "General Consultation";
          if (appt.service === "Vaccine") detailsText = `${appt.items[0]} (${appt.dose})`;
          if (appt.service === "Blood Test") detailsText = appt.items.join(", ");

          return { 
            ...appt, 
            service_details: detailsText,
            start: new Date(appt.start), 
            end: new Date(appt.end), 
            title: `${appt.title || "Unknown Patient"}` 
          };
        });
        
        setEvents(formattedEvents);
        setStats({ total: formattedEvents.length, vaccines: vacCount, bloodTests: btCount });
        setIsLoading(false);
      })
      .catch(() => { setError(true); setIsLoading(false); });
  };

  const handleReviewAction = async (status: string) => {
    if (!pendingReviewEvent) return;
    await fetch(`http://127.0.0.1:8000/admin/appointment-stages/${pendingReviewEvent.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
    });
    setPendingReviewEvent(null);
    loadAppointments();
  };

  const handleUpdateOrAddEvent = async () => {
    if(isNewBooking) {
        let finalIc = editForm.patient_ic;
        
        // Handle Direct Registration
        if (isCreatingNewPatient) {
            const isMY = newPatientForm.nationality.toUpperCase() === 'MALAYSIA';
            if (isMY) {
                const phoneRegex = /^(\+?60|0)[1-9][0-9]{7,9}$/;
                if (!phoneRegex.test(newPatientForm.phone.replace(/[\s-]/g, ''))) {
                    return alert("Invalid Malaysian phone number format.");
                }
            }
            if(!newPatientForm.name || !newPatientForm.ic_passport_number || !newPatientForm.phone) {
                return alert("Please fill required patient fields.");
            }
            
            const pRes = await fetch(`http://127.0.0.1:8000/register-patient`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ clinic_id: CLINIC_ID, telegram_id: 0, ...newPatientForm })
            });
            const pData = await pRes.json();
            if (pData.status === 'error') return alert(pData.reason);
            finalIc = newPatientForm.ic_passport_number;
        } else if (!finalIc) {
            return alert("Please select a patient.");
        }

        const payload = {
            clinic_id: CLINIC_ID, telegram_id: 0, ic_passport_number: finalIc,
            service_type: editForm.service,
            details: {
                items: editForm.items, dose: editForm.dose, reason: editForm.reason, assigned_doctor_id: editForm.doctor_ic
            },
            scheduled_time: moment(editForm.scheduled_time).format("YYYY-MM-DD HH:mm:ss")
        };
        await fetch(`http://127.0.0.1:8000/book-appointment`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
    } else {
        const payload = {
            appt_id: selectedEvent.appt_id, service_type: editForm.service,
            details: {
                items: editForm.items, dose: editForm.dose, total_doses: 1, assigned_doctor_id: editForm.doctor_ic, reason: editForm.reason
            },
            scheduled_time: moment(editForm.scheduled_time).format("YYYY-MM-DD HH:mm:ss"), status: editForm.status
        };
        await fetch(`http://127.0.0.1:8000/update-appointment`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
    }
    window.location.reload(); 
  };

  const handleCancelBooking = async () => {
    if(!confirm("Are you sure you want to cancel this booking?")) return;
    await fetch(`http://127.0.0.1:8000/admin/appointment-stages/${selectedEvent.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'canceled' })
    });
    window.location.reload(); 
  };

  const openEventModal = (event: any) => {
    setSelectedEvent(event);
    setEditForm({
      status: event.status || 'scheduled',
      scheduled_time: moment(event.start).format("YYYY-MM-DDTHH:mm"),
      doctor_ic: event.doctor_ic || '',
      patient_ic: event.patient_ic || '',
      service: event.service || 'Consultation',
      items: event.items || [],
      dose: event.dose || 'Single Dose',
      reason: event.reason || ''
    });
    setIsEditingEvent(false);
    setIsNewBooking(false);
  };

  const openNewBookingModal = () => {
    setEditForm({
      status: 'scheduled',
      scheduled_time: moment().format("YYYY-MM-DDTHH:mm"),
      doctor_ic: '', patient_ic: '', service: 'Consultation', items: [], dose: 'Single Dose', reason: ''
    });
    setNewPatientForm({ name: '', ic_passport_number: '', phone: '', gender: 'MALE', nationality: 'MALAYSIA', address: '' });
    setSelectedEvent(null);
    setIsEditingEvent(true);
    setIsNewBooking(true);
    setIsCreatingNewPatient(false);
  };

  // --- Dynamic Groupings (Hep B Normalization) ---
  const groupedVaccines = vaccinesList.reduce((acc: any, v: any) => {
    let type = (v.type || "Other").trim();
    if (type.toLowerCase().includes("hepatitis b")) type = "Hepatitis B"; 
    
    if (!acc[type]) acc[type] = [];
    acc[type].push(v); return acc;
  }, {} as Record<string, any[]>);

  const selectedVac = vaccinesList.find((v: any) => v.name === editForm.items[0]);
  let doseOptions: string[] = [];
  if (selectedVac) {
      if (selectedVac.total_doses === 1) doseOptions.push("Single Dose");
      else { for(let i=1; i<=selectedVac.total_doses; i++) doseOptions.push(`Dose ${i}`); }
      if (selectedVac.has_booster) doseOptions.push("Booster");
  }

  // --- Blood Test Package Restrictor ---
  const pkgs = bloodTestsList.filter((b: any) => b.test_type === 'package');
  const sgls = bloodTestsList.filter((b: any) => b.test_type === 'single');
  
  const selectedPkgs = pkgs.filter((p: any) => editForm.items.includes(p.name));
  const includedTestNames = new Set<string>();
  selectedPkgs.forEach((p: any) => {
      if (p.included_tests) p.included_tests.forEach((t: string) => includedTestNames.add(t));
  });
  const hasOnePackageSelected = selectedPkgs.length > 0;

  // --- Calendar Filters & Rendering ---
  const visibleEvents = events.filter(e => {
      if (e.status === 'canceled' && !filters.canceled) return false;
      if (e.status === 'completed' && !filters.completed) return false;
      if (e.status === 'no-show' && !filters.noShow) return false;
      if (e.status === 'scheduled' && !filters.scheduled) return false;
      return true;
  });

  const eventStyleGetter = (event: any) => {
    let style: any = { borderRadius: '6px', border: 'none', padding: '4px', opacity: 0.9, fontSize: '0.8rem', fontWeight: 600, color: 'white' };
    
    if (event.status === 'canceled') {
        style.backgroundColor = '#E2E8F0';
        style.color = '#64748B';
        style.textDecoration = 'line-through';
    } else if (event.status === 'no-show') {
        style.backgroundColor = '#FECACA';
        style.color = '#991B1B';
    } else if (event.status === 'completed') {
        style.backgroundColor = '#A7F3D0';
        style.color = '#065F46';
    } else {
        style.backgroundColor = event.color || '#3B82F6';
    }
    return { style };
  };

  if (isLoading) return <div className="animate-pulse h-[60vh] bg-slate-200 rounded-2xl"></div>;

  return (
    <div className="max-w-7xl mx-auto relative">
      <div className="mb-6 flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-bold text-slate-800">Dashboard Overview</h1>
            <p className="text-slate-500 mt-1">Manage today's schedule and monitor clinic load.</p>
        </div>
        
        <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-4">
                <button onClick={openNewBookingModal} className="bg-emerald-600 text-white px-5 py-2 rounded-xl font-bold text-sm shadow-md hover:bg-emerald-700">
                  + New Booking
                </button>
                <div className="flex items-center gap-2 bg-slate-900 rounded-xl px-4 py-2 shadow-lg">
                    <span className="font-bold text-slate-400 text-sm">YEAR</span>
                    <select 
                        value={currentDate.getFullYear()} 
                        onChange={(e) => {
                            const newDate = new Date(currentDate);
                            newDate.setFullYear(parseInt(e.target.value));
                            setCurrentDate(newDate);
                        }}
                        className="bg-transparent text-white font-bold text-lg outline-none cursor-pointer"
                    >
                        <option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option>
                    </select>
                </div>
            </div>
            
            {/* FILTER TOGGLES */}
            <div className="flex gap-4 text-sm font-semibold text-slate-600 bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-100">
               <label className="flex items-center gap-2 cursor-pointer hover:text-blue-600"><input type="checkbox" className="accent-blue-600 w-4 h-4" checked={filters.scheduled} onChange={e => setFilters({...filters, scheduled: e.target.checked})} /> Scheduled</label>
               <label className="flex items-center gap-2 cursor-pointer hover:text-emerald-600"><input type="checkbox" className="accent-emerald-600 w-4 h-4" checked={filters.completed} onChange={e => setFilters({...filters, completed: e.target.checked})} /> Completed</label>
               <label className="flex items-center gap-2 cursor-pointer hover:text-slate-800"><input type="checkbox" className="accent-slate-600 w-4 h-4" checked={filters.canceled} onChange={e => setFilters({...filters, canceled: e.target.checked})} /> Canceled</label>
               <label className="flex items-center gap-2 cursor-pointer hover:text-red-600"><input type="checkbox" className="accent-red-600 w-4 h-4" checked={filters.noShow} onChange={e => setFilters({...filters, noShow: e.target.checked})} /> No-Show</label>
            </div>
        </div>
      </div>

      <div style={{ height: '650px' }} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <Calendar
          localizer={localizer}
          events={visibleEvents}
          startAccessor="start"
          endAccessor="end"
          date={currentDate}
          onNavigate={setCurrentDate}
          view={currentView}
          onView={setCurrentView}
          eventPropGetter={eventStyleGetter}
          views={['month', 'week', 'day']}
          onSelectEvent={openEventModal}
        />
      </div>

      {/* PENDING REVIEW POP-UP */}
      {pendingReviewEvent && (
        <div className="fixed inset-0 bg-slate-900/80 flex items-center justify-center z-[60] backdrop-blur-sm">
           <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl transform transition-all scale-100">
              <div className="mx-auto w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
                 <AlertTriangle size={32} />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Appointment Review Needed</h2>
              <p className="text-slate-600 mb-6">
                 The scheduled time for <strong>{pendingReviewEvent.title}</strong> has ended. Did the patient attend?
              </p>
              <div className="flex gap-4 justify-center">
                 <button onClick={() => handleReviewAction('no-show')} className="px-6 py-3 bg-red-100 text-red-700 rounded-xl font-bold hover:bg-red-200 transition">No-Show</button>
                 <button onClick={() => handleReviewAction('completed')} className="px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition">Completed</button>
              </div>
           </div>
        </div>
      )}

      {/* BOOKING MODAL */}
      {(selectedEvent || isNewBooking) && !pendingReviewEvent && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-[500px] overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><CalIcon size={18}/> {isNewBooking ? "Add New Booking" : "Booking Details"}</h3>
              <button onClick={() => { setSelectedEvent(null); setIsNewBooking(false); }} className="text-slate-400 hover:text-red-500"><X size={20}/></button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <div className="flex justify-between items-end mb-1">
                    <label className="block text-xs font-bold text-slate-400 uppercase">Patient</label>
                    {isNewBooking && (
                        <button onClick={() => setIsCreatingNewPatient(!isCreatingNewPatient)} className="text-xs font-bold text-blue-600 underline">
                            {isCreatingNewPatient ? "Select Existing" : "+ Register New Patient"}
                        </button>
                    )}
                </div>
                
                {isNewBooking ? (
                    isCreatingNewPatient ? (
                        <div className="space-y-3 bg-blue-50 p-4 rounded-lg border border-blue-100">
                            <div><input type="text" placeholder="Full Name" value={newPatientForm.name} onChange={e => setNewPatientForm({...newPatientForm, name: e.target.value})} className="w-full p-2 border rounded outline-none" /></div>
                            <div className="grid grid-cols-2 gap-2">
                                <input type="text" placeholder="IC/Passport" value={newPatientForm.ic_passport_number} onChange={e => setNewPatientForm({...newPatientForm, ic_passport_number: e.target.value})} className="w-full p-2 border rounded outline-none" />
                                <input type="text" placeholder="Phone Number" value={newPatientForm.phone} onChange={e => setNewPatientForm({...newPatientForm, phone: e.target.value})} className="w-full p-2 border rounded outline-none" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <select value={newPatientForm.nationality} onChange={e => setNewPatientForm({...newPatientForm, nationality: e.target.value})} className="w-full p-2 border rounded outline-none bg-white">
                                    <option value="MALAYSIA">Malaysian</option><option value="NON-MALAYSIAN">Non-Malaysian</option>
                                </select>
                                <select value={newPatientForm.gender} onChange={e => setNewPatientForm({...newPatientForm, gender: e.target.value})} className="w-full p-2 border rounded outline-none bg-white">
                                    <option value="MALE">Male</option><option value="FEMALE">Female</option>
                                </select>
                            </div>
                        </div>
                    ) : (
                        <select value={editForm.patient_ic} onChange={e => setEditForm({...editForm, patient_ic: e.target.value})} className="w-full p-2 border rounded-lg bg-white outline-none">
                            <option value="">Select a Registered Patient</option>
                            {patients.map((p: any) => <option key={p.ic_passport_number} value={p.ic_passport_number}>{p.name} ({p.ic_passport_number})</option>)}
                        </select>
                    )
                ) : (
                    <p className="font-semibold text-lg">{selectedEvent?.title ? selectedEvent.title.split(' - ')[0] : 'Unknown Patient'}</p>
                )}
              </div>

              {isEditingEvent ? (
                <div className="space-y-4 border-t pt-4">
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Schedule Date & Time</label>
                        <input type="datetime-local" value={editForm.scheduled_time} onChange={(e) => setEditForm({...editForm, scheduled_time: e.target.value})} className="w-full p-2 border rounded-lg outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Assign Doctor</label>
                        <select value={editForm.doctor_ic} onChange={(e) => setEditForm({...editForm, doctor_ic: e.target.value})} className="w-full p-2 border rounded-lg bg-white outline-none">
                          <option value="">Any / Unassigned</option>
                          {doctors.map((d: any) => <option key={d.ic_passport_number} value={d.ic_passport_number}>{d.name}</option>)}
                        </select>
                      </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                      {!isNewBooking && (
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Booking Status</label>
                            <select value={editForm.status} onChange={(e) => setEditForm({...editForm, status: e.target.value})} className="w-full p-2 border rounded-lg bg-white outline-none">
                                <option value="scheduled">Scheduled</option>
                                <option value="completed">Completed</option>
                                <option value="canceled">Canceled</option>
                                <option value="no-show">No-Show</option>
                            </select>
                        </div>
                      )}
                      <div className={isNewBooking ? "col-span-2" : ""}>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Service Type</label>
                        <select value={editForm.service} onChange={(e) => setEditForm({...editForm, service: e.target.value, items: []})} className="w-full p-2 border rounded-lg bg-white outline-none">
                          <option value="Consultation">Consultation</option><option value="Vaccine">Vaccine</option><option value="Blood Test">Blood Test</option>
                        </select>
                      </div>
                  </div>

                  {/* DYNAMIC DETAILS EDITING */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      {editForm.service === 'Vaccine' && (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Vaccine Name</label>
                            <select value={editForm.items[0] || ''} onChange={e => {
                                const val = e.target.value;
                                const vac = vaccinesList.find((v: any) => v.name === val);
                                let defaultDose = 'Single Dose';
                                if(vac && vac.total_doses > 1) defaultDose = 'Dose 1';
                                setEditForm({...editForm, items: [val], dose: defaultDose});
                            }} className="w-full p-2 border rounded-lg bg-white outline-none">
                              <option value="">Select Vaccine</option>
                              {Object.keys(groupedVaccines).map(type => (
                                  <optgroup key={type} label={type}>
                                      {groupedVaccines[type].map((v: any) => <option key={v.id} value={v.name}>{v.name}</option>)}
                                  </optgroup>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Dose Sequence</label>
                            <select value={editForm.dose} onChange={e => setEditForm({...editForm, dose: e.target.value})} className="w-full p-2 border rounded-lg bg-white outline-none">
                                {doseOptions.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                          </div>
                        </div>
                      )}

                      {editForm.service === 'Blood Test' && (
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-2">1. Packages (Max 1)</label>
                          <div className="grid grid-cols-2 gap-2 mb-4">
                             {pkgs.map((bt: any) => {
                                const isChecked = editForm.items.includes(bt.name);
                                const disabled = hasOnePackageSelected && !isChecked;
                                return (
                                    <label key={bt.id} className={`flex items-center gap-2 bg-white p-2 rounded border text-sm ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50'}`}>
                                    <input type="checkbox" className="w-4 h-4 accent-blue-600" disabled={disabled} checked={isChecked} 
                                        onChange={e => {
                                            if(disabled) return;
                                            const newItems = e.target.checked ? [...editForm.items, bt.name] : editForm.items.filter(i => i !== bt.name);
                                            setEditForm({...editForm, items: newItems});
                                        }}
                                    /> {bt.name}
                                    </label>
                                );
                             })}
                          </div>
                          
                          <label className="block text-xs font-bold text-slate-500 mb-2">2. Single Tests</label>
                          <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                             {sgls.map((bt: any) => {
                                const isIncluded = includedTestNames.has(bt.name);
                                return (
                                    <label key={bt.id} className={`flex items-center gap-2 bg-white p-2 rounded border text-sm ${isIncluded ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50'}`}>
                                      <input type="checkbox" className="w-4 h-4 accent-blue-600" disabled={isIncluded} checked={isIncluded || editForm.items.includes(bt.name)} 
                                         onChange={e => {
                                            if(isIncluded) return;
                                            const newItems = e.target.checked ? [...editForm.items, bt.name] : editForm.items.filter(i => i !== bt.name);
                                            setEditForm({...editForm, items: newItems});
                                         }}
                                      /> {bt.name} {isIncluded && <span className="text-[10px] text-blue-500 font-bold ml-auto">(In Pkg)</span>}
                                    </label>
                                );
                             })}
                          </div>
                        </div>
                      )}

                      {editForm.service === 'Consultation' && (
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Reason / Notes</label>
                          <input type="text" value={editForm.reason || ''} onChange={e => setEditForm({...editForm, reason: e.target.value})} placeholder="e.g. Fever and cough" className="w-full p-2 border rounded-lg bg-white outline-none" />
                        </div>
                      )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Service Type</label>
                      <span className="inline-block px-3 py-1 bg-slate-100 rounded-full text-xs font-bold text-slate-600">{selectedEvent?.service || 'Unknown'}</span>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Doctor</label>
                      <p className="font-medium">{selectedEvent?.doctor || 'Unassigned'}</p>
                    </div>
                  </div>

                  <div className="col-span-2 mt-2">
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Specific Details</label>
                    <div className="p-3 bg-slate-50 border rounded-lg text-sm text-slate-700">
                      {selectedEvent?.service_details || 'N/A'}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Schedule Date & Time</label>
                      <p className="font-medium">{selectedEvent?.start ? moment(selectedEvent.start).format("dddd, MMMM Do YYYY, h:mm a") : ''}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Status</label>
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold capitalize 
                        ${selectedEvent?.status === 'completed' ? 'bg-emerald-100 text-emerald-700' 
                        : selectedEvent?.status === 'canceled' ? 'bg-slate-200 text-slate-600' 
                        : selectedEvent?.status === 'no-show' ? 'bg-red-100 text-red-700'
                        : 'bg-blue-100 text-blue-700'}`}>
                          {selectedEvent?.status}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 flex justify-between gap-3 border-t border-slate-100">
              {isEditingEvent ? (
                 <button onClick={() => {
                    if(isNewBooking) { setSelectedEvent(null); setIsNewBooking(false); }
                    else setIsEditingEvent(false);
                 }} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-medium">Cancel Edit</button>
              ) : (
                 <button onClick={handleCancelBooking} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition-colors">Cancel Booking</button>
              )}
              
              {isEditingEvent ? (
                <button onClick={handleUpdateOrAddEvent} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium">{isNewBooking ? "Create Booking" : "Save Changes"}</button>
              ) : (
                <button onClick={() => setIsEditingEvent(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium">Modify Booking</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}