"use client";

import { useState, useEffect } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { X, User, Droplet, Activity, Calendar as CalIcon } from 'lucide-react';

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
  
  const [editForm, setEditForm] = useState({
    status: 'scheduled', scheduled_time: '', doctor_ic: '', patient_ic: '',
    service: 'Consultation', items: [] as string[], dose: 'Single Dose', reason: ''
  });

  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<any>('week'); 

  useEffect(() => { 
    loadAppointments();
    loadDoctors(); 
    loadPatients();
    loadServices();
  }, []);

  const loadDoctors = () => {
    fetch(`http://127.0.0.1:8000/doctors/${CLINIC_ID}`).then(res => res.json()).then(data => setDoctors(data));
  };
  const loadPatients = () => {
    fetch(`http://127.0.0.1:8000/admin/patients/${CLINIC_ID}`).then(res => res.json()).then(data => setPatients(data));
  };

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
          
          const capStatus = appt.status.charAt(0).toUpperCase() + appt.status.slice(1);
          
          let detailsText = appt.reason || "General Consultation";
          if (appt.service === "Vaccine") detailsText = `${appt.items[0]} (${appt.dose})`;
          if (appt.service === "Blood Test") detailsText = appt.items.join(", ");

          return { 
            ...appt, 
            service_details: detailsText,
            start: new Date(appt.start), 
            end: new Date(appt.end), 
            title: `${appt.title || "Unknown Patient"} (${capStatus})` 
          };
        });
        
        setEvents(formattedEvents);
        setStats({ total: formattedEvents.length, vaccines: vacCount, bloodTests: btCount });
        
        const sorted = [...formattedEvents].sort((a,b) => a.start.getTime() - b.start.getTime());
        if (sorted.length > 0) setCurrentDate(sorted[0].start);

        setIsLoading(false);
      })
      .catch(() => { setError(true); setIsLoading(false); });
  };

  const handleUpdateOrAddEvent = async () => {
    if(isNewBooking) {
        if(!editForm.patient_ic) return alert("Please select a patient.");
        const payload = {
            clinic_id: CLINIC_ID, telegram_id: 0, ic_passport_number: editForm.patient_ic,
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
    if(!confirm("Are you sure you want to completely cancel this booking?")) return;
    await fetch(`http://127.0.0.1:8000/cancel-appointment/${selectedEvent.appt_id}`, { method: 'POST' });
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
    setSelectedEvent(null);
    setIsEditingEvent(true);
    setIsNewBooking(true);
  };

  // --- Dynamic Groupings (Explicit typings added to fix TS errors) ---
  const groupedVaccines = vaccinesList.reduce((acc: any, v: any) => {
    const type = v.type || "Other";
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

  const pkgs = bloodTestsList.filter((b: any) => b.test_type === 'package');
  const sgls = bloodTestsList.filter((b: any) => b.test_type === 'single');
  const selectedPkgs = pkgs.filter((p: any) => editForm.items.includes(p.name));
  const includedTestNames = new Set<string>();
  selectedPkgs.forEach((p: any) => {
      if (p.included_tests) p.included_tests.forEach((t: string) => includedTestNames.add(t));
  });

  const eventStyleGetter = (event: any) => ({
    style: { backgroundColor: event.color || '#3B82F6', borderRadius: '6px', border: 'none', padding: '4px', opacity: 0.9, fontSize: '0.8rem', fontWeight: 600, color: 'white' }
  });

  if (isLoading) return <div className="animate-pulse h-[60vh] bg-slate-200 rounded-2xl"></div>;

  return (
    <div className="max-w-7xl mx-auto relative">
      <div className="mb-8 flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-bold text-slate-800">Dashboard Overview</h1>
            <p className="text-slate-500 mt-1">Manage today's schedule and monitor clinic load.</p>
        </div>
        
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
      </div>
      
      {error && <div className="bg-red-50 text-red-700 p-4 rounded-xl mb-6 shadow-sm"><strong>⚠️ Connection Error:</strong> Is FastAPI running on 127.0.0.1:8000?</div>}

      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4"><div className="p-3 bg-blue-100 text-blue-600 rounded-xl"><User size={24}/></div>
          <div><p className="text-sm font-bold text-slate-400 uppercase">Total Appointments</p><h3 className="text-3xl font-black text-slate-800">{stats.total}</h3></div></div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4"><div className="p-3 bg-purple-100 text-purple-600 rounded-xl"><Activity size={24}/></div>
          <div><p className="text-sm font-bold text-slate-400 uppercase">Vaccine Appointments</p><h3 className="text-3xl font-black text-slate-800">{stats.vaccines}</h3></div></div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4"><div className="p-3 bg-red-100 text-red-600 rounded-xl"><Droplet size={24}/></div>
          <div><p className="text-sm font-bold text-slate-400 uppercase">Blood Test Appointments</p><h3 className="text-3xl font-black text-slate-800">{stats.bloodTests}</h3></div></div>
        </div>
      </div>

      <div style={{ height: '650px' }} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <Calendar
          localizer={localizer}
          events={events}
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

      {(selectedEvent || isNewBooking) && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-[500px] overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><CalIcon size={18}/> {isNewBooking ? "Add New Booking" : "Booking Details"}</h3>
              <button onClick={() => { setSelectedEvent(null); setIsNewBooking(false); }} className="text-slate-400 hover:text-red-500"><X size={20}/></button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Patient</label>
                {isNewBooking ? (
                    <select value={editForm.patient_ic} onChange={e => setEditForm({...editForm, patient_ic: e.target.value})} className="w-full p-2 border rounded-lg bg-white outline-none">
                        <option value="">Select a Registered Patient</option>
                        {patients.map((p: any) => <option key={p.ic_passport_number} value={p.ic_passport_number}>{p.name} ({p.ic_passport_number})</option>)}
                    </select>
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
                            <option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="canceled">Canceled</option>
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
                          <label className="block text-xs font-bold text-slate-500 mb-2">1. Packages</label>
                          <div className="grid grid-cols-2 gap-2 mb-4">
                             {pkgs.map((bt: any) => (
                                <label key={bt.id} className="flex items-center gap-2 bg-white p-2 rounded border text-sm cursor-pointer hover:bg-slate-50">
                                  <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={editForm.items.includes(bt.name)} 
                                     onChange={e => {
                                        const newItems = e.target.checked ? [...editForm.items, bt.name] : editForm.items.filter(i => i !== bt.name);
                                        setEditForm({...editForm, items: newItems});
                                     }}
                                  /> {bt.name}
                                </label>
                             ))}
                          </div>
                          
                          <label className="block text-xs font-bold text-slate-500 mb-2">2. Single Tests</label>
                          <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                             {sgls.map((bt: any) => {
                                const isIncluded = includedTestNames.has(bt.name);
                                return (
                                    <label key={bt.id} className={`flex items-center gap-2 bg-white p-2 rounded border text-sm ${isIncluded ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50'}`}>
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
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold capitalize ${selectedEvent?.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : selectedEvent?.status === 'canceled' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{selectedEvent?.status}</span>
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
                 <button onClick={handleCancelBooking} className="px-4 py-2 bg-red-100 text-red-600 rounded-lg font-medium hover:bg-red-200 transition-colors">Cancel Booking</button>
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