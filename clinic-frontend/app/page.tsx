"use client";

import { useState, useEffect } from 'react';
import { Calendar, momentLocalizer, View } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { X, User, Droplet, Activity, Calendar as CalIcon, AlertTriangle, FileText, Search, Bell } from 'lucide-react';

const toTitleCase = (str: string) => {
    if (!str) return '';
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
};

const localizer = momentLocalizer(moment);

export default function AdminDashboard() {
  const [activeClinicId, setActiveClinicId] = useState<string>("");
  
  const [events, setEvents] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [vaccinesList, setVaccinesList] = useState<any[]>([]);
  const [bloodTestsList, setBloodTestsList] = useState<any[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [stats, setStats] = useState({ total: 0, consultations: 0, vaccines: 0, bloodTests: 0 });
  
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [isEditingEvent, setIsEditingEvent] = useState(false);
  
  const [isNewBooking, setIsNewBooking] = useState(false);
  const [isCreatingNewPatient, setIsCreatingNewPatient] = useState(false);
  const [newPatientForm, setNewPatientForm] = useState({ name: '', ic_passport_number: '', phone: '', gender: 'MALE', nationality: 'MALAYSIA', address: '' });
  
  const [patientSearchText, setPatientSearchText] = useState("");
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  
  const [pendingReviewEvent, setPendingReviewEvent] = useState<any>(null);
  const [filters, setFilters] = useState({ scheduled: true, completed: true, canceled: false, noShow: true });

  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");

  const [minDate, setMinDate] = useState(moment().format("YYYY-MM-DD"));
  const [manualDates, setManualDates] = useState<Record<string, string>>({});

  const [editForm, setEditForm] = useState({
    status: 'scheduled', doctor_ic: '', patient_ic: '',
    service: 'Others', items: [] as string[], dose: 'Single Dose', reason: ''
  });

  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState("Change of schedule");
  const [customCancelReason, setCustomCancelReason] = useState("");
  
  const [inlineCancelReason, setInlineCancelReason] = useState("");

  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<View>('week'); 

  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState("ALL");
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => { 
      const userStr = localStorage.getItem('aicas_user');
      if (userStr) {
          const user = JSON.parse(userStr);
          if (user.clinic_id) {
              setActiveClinicId(user.clinic_id);
              loadData(user.clinic_id);
          }
      }
  }, []);

  const loadData = async (cid: string) => {
      await Promise.all([
          loadAppointments(cid),
          loadDoctors(cid),
          loadPatients(cid),
          loadServices(cid)
      ]);
      setIsLoading(false);
  };

  useEffect(() => {
    const interval = setInterval(() => {
        if (!events.length || pendingReviewEvent) return;
        const now = new Date();
        const passedEvent = events.find(e => 
            e.status === 'scheduled' && 
            e.end < now && 
            e.end.toDateString() === now.toDateString() 
        );
        if (passedEvent) setPendingReviewEvent(passedEvent);
    }, 15000); 
    return () => clearInterval(interval);
  }, [events, pendingReviewEvent]);

  const loadDoctors = async (cid: string) => {
      try {
          const res = await fetch(`http://127.0.0.1:8000/admin/doctors-all/${cid}`);
          if (res.ok) {
              const docs = await res.json();
              const docsWithSched = await Promise.all(docs.map(async (d: any) => {
                  const schedRes = await fetch(`http://127.0.0.1:8000/admin/doctors/${d.ic_passport_number}/availability/${cid}`);
                  const schedules = schedRes.ok ? await schedRes.json() : [];
                  return { ...d, schedules };
              }));
              setDoctors(docsWithSched);
          }
      } catch (err) {}
  };

  const loadPatients = async (cid: string) => {
      try {
          const res = await fetch(`http://127.0.0.1:8000/admin/patients/${cid}`);
          if (res.ok) setPatients(await res.json());
      } catch (err) {}
  };

  const loadServices = async (cid: string) => {
      try {
          const vRes = await fetch(`http://127.0.0.1:8000/vaccines/${cid}`);
          if (vRes.ok) setVaccinesList(await vRes.json());
          
          const pkgsRes = await fetch(`http://127.0.0.1:8000/blood-tests/${cid}/package`);
          const pkgs = pkgsRes.ok ? await pkgsRes.json() : [];
          
          const sglsRes = await fetch(`http://127.0.0.1:8000/blood-tests/${cid}/single`);
          const sgls = sglsRes.ok ? await sglsRes.json() : [];
          
          setBloodTestsList([...pkgs, ...sgls]);
      } catch (err) {}
  };

  const loadAppointments = (cid: string) => {
    fetch(`http://127.0.0.1:8000/admin/appointments/${cid}`)
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(data => {
        if (!Array.isArray(data) || data.length === 0) { 
            setEvents([]); return; 
        }

        let vacCount = 0, btCount = 0, consultCount = 0;
        const formattedEvents = data.map((appt: any) => {
          if (appt.service === "Vaccine") vacCount++;
          if (appt.service === "Blood Test") btCount++;
          if (appt.service === "Others") consultCount++;
          
          let detailsText = appt.reason || "Others";
          if (appt.service === "Vaccine") detailsText = `${appt.items[0]} (${appt.dose})`;
          if (appt.service === "Blood Test") detailsText = appt.items.join(", ");

          let titleText = appt.title || "Unknown Patient";
          if (appt.status === "canceled") {
              titleText = `${titleText} (Cancelled: ${appt.cancel_reason || 'No reason'})`;
          }

          return { 
            ...appt, 
            service_details: detailsText,
            start: new Date(appt.start), 
            end: new Date(appt.end), 
            title: titleText,
            cancel_reason: appt.cancel_reason
          };
        });
        
        setEvents(formattedEvents);
        setStats({ total: formattedEvents.length, consultations: consultCount, vaccines: vacCount, bloodTests: btCount });
      })
      .catch(() => { setError(true); });
  };

  const handleReviewAction = async (status: string) => {
    if (!pendingReviewEvent) return;
    try {
        const reviewRes = await fetch(`http://127.0.0.1:8000/admin/appointment-stages/${pendingReviewEvent.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        
        if (!reviewRes.ok) {
            const errorData = await reviewRes.json();
            throw new Error(errorData.detail || 'Review action failed');
        }
        
        setPendingReviewEvent(null);
        loadAppointments(activeClinicId);
    } catch (err: any) {
        const errorMsg = err?.message || "Failed to connect to backend";
        alert(`Error: ${errorMsg}`);
    }
  };

  const getAvailableSlots = () => {
      if (!editDate) return { times: [], docsForTime: {} };
      const dayOfWeek = moment(editDate).format("ddd").toLowerCase();
      const duration = editForm.service === 'Vaccine' ? 15 : 30;
      const now = moment();
      const isToday = moment(editDate).isSame(now, 'day');

      const timesSet = new Set<string>();
      const docsForTime: Record<string, any[]> = {};

      doctors.forEach(doc => {
          if(!doc.schedules) return;
          // Case-insensitive day check
          const todayScheds = doc.schedules.filter((s: any) => s.day_of_week && s.day_of_week.toLowerCase() === dayOfWeek);
          
          todayScheds.forEach((sched: any) => {
              // Let moment parse the string dynamically to prevent "Invalid Date" errors if the DB returns seconds (e.g. 09:00:00)
              let curr = moment(`${editDate} ${sched.start_time}`);
              const end = moment(`${editDate} ${sched.end_time}`);
              
              while (curr.clone().add(duration, 'minutes').isSameOrBefore(end)) {
                  const timeStr = curr.format("HH:mm");
                  const slotStart = curr.clone();
                  const slotEnd = curr.clone().add(duration, 'minutes');
                  
                  // Allow past times ONLY if we are actively editing an existing event on that exact time
                  const isCurrentEventTime = selectedEvent && moment(selectedEvent.start).format("HH:mm") === timeStr && moment(selectedEvent.start).format("YYYY-MM-DD") === editDate;

                  if (isToday && slotStart.isSameOrBefore(now) && !isCurrentEventTime) {
                      curr.add(duration, 'minutes');
                      continue;
                  }

                  // Robust Overlap Check - checks if slot overlaps with an ongoing appointment
                  const isBusy = events.some(e => {
                      if (e.doctor_ic !== doc.ic_passport_number || e.status === 'canceled') return false;
                      if (selectedEvent && e.id === selectedEvent.id) return false;
                      
                      const eStart = moment(e.start);
                      const eEnd = moment(e.end);
                      
                      return slotStart.isBefore(eEnd) && slotEnd.isAfter(eStart);
                  });
                  
                  if (!isBusy || isCurrentEventTime) {
                      timesSet.add(timeStr);
                      if (!docsForTime[timeStr]) docsForTime[timeStr] = [];
                      // Prevent duplicate doctors in the same slot array
                      if (!docsForTime[timeStr].some(d => d.ic_passport_number === doc.ic_passport_number)) {
                          docsForTime[timeStr].push(doc);
                      }
                  }
                  curr.add(duration, 'minutes');
              }
          });
      });

      return { 
          times: Array.from(timesSet).sort(), 
          docsForTime 
      };
  };

  const handleUpdateOrAddEvent = async () => {
    try {
        if (!editDate || !editTime || !editForm.doctor_ic) {
            return alert("Please select Date, Time, and Doctor.");
        }

        const scheduled_time = `${editDate} ${editTime}:00`;

        let currentPatientGender = "ANY";
        if (isCreatingNewPatient) {
            currentPatientGender = newPatientForm.gender.toUpperCase();
        } else if (editForm.patient_ic) {
            const sp = patients.find(p => p.ic_passport_number === editForm.patient_ic);
            if (sp) currentPatientGender = sp.gender.toUpperCase();
        }

        // --- UPGRADED: Vaccine Agent Validation ---
        const isDateTimeUnchanged = isEditingEvent && selectedEvent &&
              editDate === moment(selectedEvent.start).format("YYYY-MM-DD") && 
              editTime === moment(selectedEvent.start).format("HH:mm");

        // We skip validation if it's an existing booking and they didn't change the Date or Time
        if (editForm.service === "Vaccine" && editForm.items.length > 0 && !isDateTimeUnchanged) {
            let tempIc = editForm.patient_ic;
            if (isNewBooking && isCreatingNewPatient) {
                let rawIc = newPatientForm.ic_passport_number.replace(/[\s-]/g, '');
                if (newPatientForm.nationality.toUpperCase() === 'MALAYSIA' && rawIc.length === 12) {
                    tempIc = `${rawIc.substring(0,6)}-${rawIc.substring(6,8)}-${rawIc.substring(8,12)}`;
                } else {
                    tempIc = rawIc;
                }
            }
            
            if (tempIc) {
                let isValidated = false;
                let currentManualDates = { ...manualDates };
                
                while (!isValidated) {
                    try {
                        const valRes = await fetch(`http://127.0.0.1:8000/validate-vaccine-booking`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                clinic_id: activeClinicId, ic: tempIc,
                                vaccine_name: editForm.items[0], target_dose: editForm.dose,
                                requested_time: scheduled_time, manual_dates: currentManualDates,
                                exclude_stage_id: (isEditingEvent && selectedEvent) ? selectedEvent.extendedProps.stage_id : null // Pass ID to exclude
                            })
                        });
                        if (valRes.ok) {
                            const valData = await valRes.json();
                            if (!valData.is_valid) {
                                if (valData.ask_external_yes_no) {
                                    const tookExternal = window.confirm(`${valData.reason}\n\nClick OK for YES, Cancel for NO.`);
                                    if (tookExternal) {
                                        let validDateEntered = false;
                                        while (!validDateEntered) {
                                            const manualDate = window.prompt(`Please provide the vaccination date for ${valData.ask_external_yes_no} (YYYY-MM-DD):`);
                                            if (manualDate === null) return alert("Validation canceled.");
                                            if (/^\d{4}-\d{2}-\d{2}$/.test(manualDate)) {
                                                currentManualDates[valData.ask_external_yes_no] = manualDate;
                                                validDateEntered = true;
                                            } else {
                                                alert("❌ Invalid format! Use YYYY-MM-DD.");
                                            }
                                        }
                                        setManualDates(currentManualDates);
                                        continue; // Re-validate with the new date
                                    } else {
                                        // Patient clicked NO. We tell backend to ignore the missing external dose by passing a special flag if needed,
                                        // OR natively, we just accept the target_dose as valid to book now.
                                        alert(`You previously missed this dose. You should continue with ${valData.ask_external_yes_no}.`);
                                        editForm.dose = valData.ask_external_yes_no;
                                        break; // Exit loop and allow booking
                                    }
                                } else {
                                    return alert(`⚠️ Vaccine Agent Validation Failed:\n${valData.reason}`);
                                }
                            } else {
                                editForm.dose = valData.target_dose; // Auto-apply the backend's determined dose
                                isValidated = true;
                            }
                        } else isValidated = true;
                    } catch (e) { isValidated = true; }
                }
            }
        }
        
        if(!window.confirm("Are you sure this details are correct?")) return;

        let formattedReason = editForm.reason;
        if (editForm.service === "Others") {
            formattedReason = toTitleCase(formattedReason);
        }

        if(isNewBooking) {
            let finalIc = editForm.patient_ic;
            
            if (isCreatingNewPatient) {
                if(!newPatientForm.name || !newPatientForm.ic_passport_number || !newPatientForm.phone) {
                    return alert("Please fill required patient fields.");
                }
                
                const isMY = newPatientForm.nationality.toUpperCase() === 'MALAYSIA';
                
                // 1. Strict IC Formatting
                let rawIc = newPatientForm.ic_passport_number.replace(/[\s-]/g, '');
                let finalFormattedIc = rawIc;
                
                if (isMY) {
                    if (rawIc.length !== 12) return alert("Malaysian IC must be exactly 12 digits (e.g., XXXXXXXXXXXX or XXXXXX-XX-XXXX).");
                    finalFormattedIc = `${rawIc.substring(0,6)}-${rawIc.substring(6,8)}-${rawIc.substring(8,12)}`;
                }
                
                // 2. Strict Phone Formatting
                let rawPhone = newPatientForm.phone.replace(/[\s-]/g, '');
                let finalFormattedPhone = rawPhone;
                
                if (isMY) {
                    if (rawPhone.startsWith('60')) rawPhone = rawPhone.substring(2);
                    else if (rawPhone.startsWith('0')) rawPhone = rawPhone.substring(1);
                    else if (rawPhone.startsWith('+60')) rawPhone = rawPhone.substring(3);
                    
                    if (!rawPhone.startsWith('1') || (rawPhone.length !== 9 && rawPhone.length !== 10)) {
                        return alert("Invalid Malaysian phone format. Valid formats: +601X-XXXXXXXX, 01XXXXXXXX, etc.");
                    }
                    finalFormattedPhone = `+60${rawPhone}`;
                } else {
                    if (!rawPhone.startsWith('+')) return alert("Non-Malaysian phone must start with a '+' symbol (No hyphens).");
                    finalFormattedPhone = rawPhone; 
                }

                const pRes = await fetch(`http://127.0.0.1:8000/register-patient`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ 
                        clinic_id: activeClinicId, telegram_id: 0, 
                        ...newPatientForm,
                        name: newPatientForm.name.toUpperCase(),
                        ic_passport_number: finalFormattedIc,
                        phone: finalFormattedPhone
                    })
                });
                
                if (pRes.status === 409) return alert("This IC/Passport has already been registered in the system.");
                
                if (!pRes.ok) {
                    const errorData = await pRes.json();
                    return alert(`Patient registration error: ${errorData.detail || 'Unknown error'}`);
                }
                
                const pData = await pRes.json();
                if (pData.status === 'error') return alert(pData.reason);
                finalIc = finalFormattedIc;
            } else if (!finalIc) {
                return alert("Please select a patient.");
            }

            const payload = {
                clinic_id: activeClinicId, telegram_id: 0, ic_passport_number: finalIc,
                service_type: editForm.service,
                details: {
                    items: editForm.items, dose: editForm.dose, general_notes: editForm.reason, assigned_doctor_id: editForm.doctor_ic, manual_dates: manualDates
                },
                scheduled_time: scheduled_time
            };
            const bookRes = await fetch(`http://127.0.0.1:8000/book-appointment`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            
            if (!bookRes.ok) {
                const errorData = await bookRes.json();
                throw new Error(errorData.detail || 'Booking failed');
            }
        } else {
            if (!selectedEvent) {
                return alert("Error: No appointment selected for update.");
            }
            
            const payload: any = {
                appt_id: selectedEvent.appt_id, service_type: editForm.service,
                details: {
                    items: editForm.items, dose: editForm.dose, total_doses: 1, assigned_doctor_id: editForm.doctor_ic, general_notes: editForm.reason
                },
                scheduled_time: scheduled_time, status: editForm.status
            };
            
            if (editForm.status === 'canceled') {
                if (!inlineCancelReason.trim()) return alert("Please enter a cancel reason.");
                payload.cancel_reason = inlineCancelReason;
            }

            const updateRes = await fetch(`http://127.0.0.1:8000/update-appointment`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            
            if (!updateRes.ok) {
                const errorData = await updateRes.json();
                throw new Error(errorData.detail || 'Update failed');
            }
        }
        window.location.reload(); 
    } catch (err: any) {
        const errorMsg = err?.message || "Failed to connect to backend";
        alert(`Error: ${errorMsg}`);
    }
  };

  const executeCancellation = async () => {
    const reason = cancelReason === "Other" ? customCancelReason : cancelReason;
    if (!reason.trim()) return alert("Please provide a cancellation reason.");
    if (!selectedEvent) return alert("Error: No appointment selected for cancellation.");

    try {
        const cancelRes = await fetch(`http://127.0.0.1:8000/admin/appointment-stages/${selectedEvent.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ status: 'canceled', cancel_reason: reason })
        });
        
        if (!cancelRes.ok) {
            const errorData = await cancelRes.json();
            throw new Error(errorData.detail || 'Cancellation failed');
        }
        
        window.location.reload();
    } catch (err: any) {
        const errorMsg = err?.message || "Failed to connect to backend";
        alert(`Error: ${errorMsg}`);
    }
  };

  const openEventModal = (event: any) => {
    setSelectedEvent(event);
    setEditDate(moment(event.start).format("YYYY-MM-DD"));
    setMinDate(moment().format("YYYY-MM-DD")); 
    setManualDates({});                        
    setEditTime(moment(event.start).format("HH:mm"));
    setEditForm({
      status: event.status || 'scheduled',
      doctor_ic: event.doctor_ic || (doctors.length > 0 ? doctors[0].ic_passport_number : ''),
      patient_ic: event.patient_ic || '',
      service: event.service || 'Others',
      items: event.items || [],
      dose: event.dose || 'Single Dose',
      reason: event.reason || ''
    });
    setPatientSearchText(`${event.patient_name} (${event.patient_ic})`);
    setInlineCancelReason(event.cancel_reason || "");
    setIsEditingEvent(false);
    setIsNewBooking(false);
  };

  const openNewBookingModal = () => {
    setEditDate(moment().format("YYYY-MM-DD"));
    setMinDate(moment().format("YYYY-MM-DD")); 
    setManualDates({});                       
    setEditTime(""); 
    setEditForm({
      status: 'scheduled',
      doctor_ic: '', 
      patient_ic: '', service: 'Others', items: [], dose: 'Single Dose', reason: ''
    });
    setNewPatientForm({ name: '', ic_passport_number: '', phone: '', gender: 'MALE', nationality: 'MALAYSIA', address: '' });
    setPatientSearchText("");
    setSelectedEvent(null);
    setIsEditingEvent(true);
    setIsNewBooking(true);
    setIsCreatingNewPatient(false);
  };

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

  const pkgs = bloodTestsList.filter((b: any) => b.test_type === 'package');
  const sgls = bloodTestsList.filter((b: any) => b.test_type === 'single');
  
  const selectedPkgs = pkgs.filter((p: any) => editForm.items.includes(p.name));
  const includedTestNames = new Set<string>();
  selectedPkgs.forEach((p: any) => {
      if (p.included_tests) p.included_tests.forEach((t: string) => includedTestNames.add(t));
  });
  const hasOnePackageSelected = selectedPkgs.length > 0;

  const visibleEvents = events.filter(e => {
      if (e.status === 'canceled' && !filters.canceled) return false;
      if (e.status === 'completed' && !filters.completed) return false;
      if (e.status === 'no-show' && !filters.noShow) return false;
      if (e.status === 'scheduled' && !filters.scheduled) return false;
      if (selectedDoctorFilter !== "ALL" && e.doctor_ic !== selectedDoctorFilter) return false;
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

  const { times: availableTimes, docsForTime } = getAvailableSlots();
  const availableDocs = editTime ? (docsForTime[editTime] || []) : [];

  if (isLoading) return (
    <div className="max-w-7xl mx-auto relative">
      <div className="mb-6 flex justify-between items-center"><h1 className="text-3xl font-bold text-slate-800">Dashboard Overview</h1></div>
      <div className="animate-pulse h-[60vh] bg-slate-200 rounded-2xl"></div>
    </div>
  );

  const customSlotPropGetter = (date: Date) => {
      const dayStr = moment(date).format("ddd").toLowerCase();
      const timeStr = moment(date).format("HH:mm");
      const isToday = moment(date).isSame(moment(), 'day');
      
      let isWorking = false;
      const docsToCheck = selectedDoctorFilter === "ALL" ? doctors : doctors.filter(d => d.ic_passport_number === selectedDoctorFilter);

      for (const doc of docsToCheck) {
          if (!doc.schedules) continue;
          const todayScheds = doc.schedules.filter((s: any) => s.day_of_week === dayStr);
          for (const sched of todayScheds) {
              if (timeStr >= sched.start_time.substring(0,5) && timeStr < sched.end_time.substring(0,5)) {
                  isWorking = true; break;
              }
          }
          if (isWorking) break;
      }
      
      if (!isWorking) {
          return { style: { backgroundColor: '#f1f5f9', cursor: 'not-allowed' } };
      }
      return {};
  };

  return (
    <div className="max-w-7xl mx-auto relative">
      <div className="mb-6 flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-bold text-slate-800">Dashboard Overview</h1>
            <p className="text-slate-500 mt-1">Manage today's schedule and monitor clinic load.</p>
        </div>
        
        <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-4">
                <select value={selectedDoctorFilter} onChange={(e) => setSelectedDoctorFilter(e.target.value)} className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl font-bold text-sm shadow-sm outline-none">
                    <option value="ALL">All Doctors</option>
                    {doctors.map(d => <option key={d.ic_passport_number} value={d.ic_passport_number}>{d.name}</option>)}
                </select>
                
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
                        <option value="2025" className="bg-black text-white">2025</option>
                        <option value="2026" className="bg-black text-white">2026</option>
                        <option value="2027" className="bg-black text-white">2027</option>
                    </select>
                </div>
            </div>
            
            <div className="flex gap-4 text-sm font-semibold text-slate-600 bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-100">
               <label className="flex items-center gap-2 cursor-pointer hover:text-blue-600"><input type="checkbox" className="accent-blue-600 w-4 h-4" checked={filters.scheduled} onChange={e => setFilters({...filters, scheduled: e.target.checked})} /> Scheduled</label>
               <label className="flex items-center gap-2 cursor-pointer hover:text-emerald-600"><input type="checkbox" className="accent-emerald-600 w-4 h-4" checked={filters.completed} onChange={e => setFilters({...filters, completed: e.target.checked})} /> Completed</label>
               <label className="flex items-center gap-2 cursor-pointer hover:text-slate-800"><input type="checkbox" className="accent-slate-600 w-4 h-4" checked={filters.canceled} onChange={e => setFilters({...filters, canceled: e.target.checked})} /> Canceled</label>
               <label className="flex items-center gap-2 cursor-pointer hover:text-red-600"><input type="checkbox" className="accent-red-600 w-4 h-4" checked={filters.noShow} onChange={e => setFilters({...filters, noShow: e.target.checked})} /> No-Show</label>
            </div>
        </div>
      </div>

      {error && (
         <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-xl font-medium flex items-center gap-3">
             <AlertTriangle size={20} /> Failed to connect to the backend server.
         </div>
      )}

      <div className="grid grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4"><div className="p-3 bg-blue-100 text-blue-600 rounded-xl"><User size={24}/></div>
          <div><p className="text-[11px] font-bold text-slate-400 uppercase">Total Bookings</p><h3 className="text-3xl font-black text-slate-800">{stats.total}</h3></div></div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4"><div className="p-3 bg-orange-100 text-orange-600 rounded-xl"><FileText size={24}/></div>
          <div><p className="text-[11px] font-bold text-slate-400 uppercase">Others</p><h3 className="text-3xl font-black text-slate-800">{stats.consultations}</h3></div></div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4"><div className="p-3 bg-purple-100 text-purple-600 rounded-xl"><Activity size={24}/></div>
          <div><p className="text-[11px] font-bold text-slate-400 uppercase">Vaccines</p><h3 className="text-3xl font-black text-slate-800">{stats.vaccines}</h3></div></div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4"><div className="p-3 bg-red-100 text-red-600 rounded-xl"><Droplet size={24}/></div>
          <div><p className="text-[11px] font-bold text-slate-400 uppercase">Blood Tests</p><h3 className="text-3xl font-black text-slate-800">{stats.bloodTests}</h3></div></div>
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
          slotPropGetter={customSlotPropGetter}
        />
      </div>

      {pendingReviewEvent && (
        <div className="fixed inset-0 bg-slate-900/80 flex items-center justify-center z-[60] backdrop-blur-sm">
           <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl transform transition-all scale-100">
              <div className="mx-auto w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
                 <AlertTriangle size={32} />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Appointment Review Needed</h2>
              <p className="text-slate-600 mb-6">
                 The scheduled time for <strong>{pendingReviewEvent.patient_name} - {pendingReviewEvent.stage_name}</strong> has ended. Did the patient attend?
              </p>
              <div className="flex gap-4 justify-center">
                 <button onClick={() => handleReviewAction('no-show')} className="px-6 py-3 bg-red-100 text-red-700 rounded-xl font-bold hover:bg-red-200 transition">No-Show</button>
                 <button onClick={() => handleReviewAction('completed')} className="px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition">Completed</button>
              </div>
           </div>
        </div>
      )}

      {cancelModalVisible && (
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
                      <button onClick={() => setCancelModalVisible(false)} className="px-4 py-2 bg-slate-100 rounded-lg text-slate-700 font-medium">Back</button>
                      <button onClick={executeCancellation} className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium">Confirm Cancel</button>
                  </div>
              </div>
          </div>
      )}

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
                            <div><input type="text" placeholder="Full Name" value={newPatientForm.name} onChange={e => setNewPatientForm({...newPatientForm, name: e.target.value})} className="w-full p-2 border rounded outline-none uppercase" /></div>
                            <div className="grid grid-cols-2 gap-2">
                                <input type="text" placeholder="IC/Passport" value={newPatientForm.ic_passport_number} onChange={e => setNewPatientForm({...newPatientForm, ic_passport_number: e.target.value})} className="w-full p-2 border rounded outline-none uppercase" />
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
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search size={14} className="text-slate-400" /></div>
                            <input 
                                type="text" 
                                placeholder="Search by Name or IC/Passport..." 
                                value={patientSearchText}
                                onChange={e => {
                                    setPatientSearchText(e.target.value);
                                    setShowPatientDropdown(true);
                                    if (!e.target.value) setEditForm({...editForm, patient_ic: ''});
                                }}
                                onFocus={() => setShowPatientDropdown(true)}
                                className="w-full p-2 pl-9 border rounded-lg bg-white outline-none focus:border-blue-500 transition-colors"
                            />
                            {showPatientDropdown && patientSearchText && (
                                <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-xl max-h-40 overflow-y-auto">
                                    {patients.filter(p => p.name.toLowerCase().includes(patientSearchText.toLowerCase()) || p.ic_passport_number.includes(patientSearchText)).map(p => (
                                        <div 
                                            key={p.ic_passport_number} 
                                            className="p-2 hover:bg-slate-50 cursor-pointer text-sm border-b last:border-0"
                                            onClick={() => {
                                                setEditForm({...editForm, patient_ic: p.ic_passport_number});
                                                setPatientSearchText(`${p.name} (${p.ic_passport_number})`);
                                                setShowPatientDropdown(false);
                                            }}
                                        >
                                            <span className="font-bold block text-slate-800">{p.name}</span>
                                            <span className="text-xs text-slate-500 font-mono">{p.ic_passport_number}</span>
                                        </div>
                                    ))}
                                    {patients.filter(p => p.name.toLowerCase().includes(patientSearchText.toLowerCase()) || p.ic_passport_number.includes(patientSearchText)).length === 0 && (
                                        <div className="p-3 text-center text-sm text-slate-500">No patient found.</div>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                ) : (
                    <p className="font-semibold text-lg">{selectedEvent?.patient_name || 'Unknown Patient'}</p>
                )}
              </div>

              {isEditingEvent ? (
                <div className="space-y-4 border-t pt-4">
                  <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Date</label>
                        <input type="date" min={minDate} value={editDate} onChange={(e) => {
                            setEditDate(e.target.value);
                            setEditTime("");
                            setEditForm(prev => ({...prev, doctor_ic: ''}));
                        }} className="w-full p-2 border rounded-lg outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Time</label>
                        <select value={editTime} onChange={e => {
                            const newTime = e.target.value;
                            setEditTime(newTime);
                            const docs = docsForTime[newTime] || [];
                            // Automatically assign a free doctor for this slot if the current one is not valid
                            if (docs.length > 0 && !docs.find(d => d.ic_passport_number === editForm.doctor_ic)) {
                                setEditForm(prev => ({...prev, doctor_ic: docs[0].ic_passport_number}));
                            } else if (docs.length === 0) {
                                setEditForm(prev => ({...prev, doctor_ic: ''}));
                            }
                        }} className="w-full p-2 border rounded-lg outline-none bg-white">
                            <option value="">Select Time</option>
                            {availableTimes.length === 0 && editDate ? <option value="" disabled>No Slots</option> : 
                             availableTimes.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Assign Doctor</label>
                        <select value={editForm.doctor_ic} onChange={(e) => setEditForm({...editForm, doctor_ic: e.target.value})} className="w-full p-2 border rounded-lg bg-white outline-none">
                          {availableDocs.length === 0 ? <option value="">No Free Doctors</option> :
                           availableDocs.map((d: any) => <option key={d.ic_passport_number} value={d.ic_passport_number}>{d.name}</option>)}
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
                                <option value="no-show">No-Show</option>
                                <option value="canceled">Canceled</option>
                            </select>
                        </div>
                      )}
                      <div className={isNewBooking ? "col-span-2" : ""}>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Service Type</label>
                        <select 
                            value={editForm.service} 
                            disabled={!isNewBooking && editForm.service === "Vaccine"}
                            onChange={(e) => {
                                setEditForm({...editForm, service: e.target.value, items: [], doctor_ic: ''});
                                setEditTime(""); // Clear the time to refresh 15/30 min intervals correctly
                            }} 
                            className="w-full p-2 border rounded-lg bg-white outline-none disabled:bg-slate-100 disabled:text-slate-500"
                        >
                          <option value="Others">Others</option>
                          <option value="Vaccine">Vaccine</option>
                          <option value="Blood Test">Blood Test</option>
                        </select>
                      </div>
                  </div>

                  {editForm.status === 'canceled' && (
                      <div className="col-span-2">
                          <label className="block text-xs font-bold text-red-500 uppercase mb-1">Cancellation Reason <span className="text-red-500">*</span></label>
                          <select
                              value={["Change of schedule", "Feeling better", "Booked wrong service", "Personal reasons"].includes(inlineCancelReason) ? inlineCancelReason : (inlineCancelReason ? "Other" : "")}
                              onChange={(e) => {
                                  if (e.target.value !== "Other") {
                                      setInlineCancelReason(e.target.value);
                                  } else {
                                      setInlineCancelReason(""); // Clear to allow typing
                                  }
                              }}
                              className="w-full p-2 border rounded-lg bg-white outline-none border-red-300 mb-2"
                          >
                              <option value="" disabled>Select Reason...</option>
                              <option value="Change of schedule">Change of schedule</option>
                              <option value="Feeling better">Feeling better</option>
                              <option value="Booked wrong service">Booked wrong service</option>
                              <option value="Personal reasons">Personal reasons</option>
                              <option value="Other">Other (Type below)</option>
                          </select>
                          
                          {/* Only show the text input if they choose 'Other' or haven't picked a preset reason */}
                          {!["Change of schedule", "Feeling better", "Booked wrong service", "Personal reasons"].includes(inlineCancelReason) && (
                              <input 
                                  type="text" 
                                  value={inlineCancelReason} 
                                  onChange={e => setInlineCancelReason(e.target.value)} 
                                  className="w-full p-2 border rounded-lg bg-white outline-none border-red-300" 
                                  placeholder="Please specify why this was canceled..." 
                              />
                          )}
                      </div>
                  )}

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      {editForm.service === 'Vaccine' && (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Vaccine Name</label>
                            <select 
                                value={editForm.items[0] || ''} 
                                disabled={!isNewBooking && editForm.service === "Vaccine"}
                                onChange={async e => {
                                    const val = e.target.value;
                                    setEditForm(prev => ({...prev, items: [val], dose: 'Calculating...'}));

                                    let tempIc = editForm.patient_ic;
                                    if (isNewBooking && isCreatingNewPatient) {
                                        let rawIc = newPatientForm.ic_passport_number.replace(/[\s-]/g, '');
                                        if (newPatientForm.nationality.toUpperCase() === 'MALAYSIA' && rawIc.length === 12) {
                                            tempIc = `${rawIc.substring(0,6)}-${rawIc.substring(6,8)}-${rawIc.substring(8,12)}`;
                                        } else { tempIc = rawIc; }
                                    }
                                    
                                    if (val && tempIc) {
                                        try {
                                            const res = await fetch(`http://127.0.0.1:8000/patients/${tempIc}/next-vaccine-dose/${encodeURIComponent(val)}`);
                                            if (res.ok) {
                                                const data = await res.json();
                                                if (data.is_brand_switch) {
                                                    alert(`⚠️ Brand Switch Detected:\nYou started a cycle with ${data.active_brand}. You must complete that cycle before switching to ${val}.`);
                                                    setEditForm(prev => ({...prev, items: [], dose: ''})); // Reset selection
                                                } else if (data.next_dose) {
                                                    setEditForm(prev => ({...prev, items: [val], dose: data.next_dose}));
                                                }
                                            }
                                        } catch (err) { console.error(err); }
                                    }
                                }} 
                                className="w-full p-2 border rounded-lg bg-white outline-none disabled:bg-slate-100 disabled:text-slate-500"
                            >
                              <option value="">Select Vaccine</option>
                              {Object.keys(groupedVaccines).map(type => (
                                  <optgroup key={type} label={type}>
                                      {groupedVaccines[type].filter((v:any) => !v.is_low_stock).map((v: any) => <option key={v.id} value={v.name}>{v.name}</option>)}
                                  </optgroup>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Dose Sequence (Auto-Determined)</label>
                            <input type="text" value={editForm.dose} disabled className="w-full p-2 border rounded-lg bg-slate-100 outline-none text-slate-500 font-bold" />
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
                                            const newItems = e.target.checked ? [bt.name] : [];
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

                      {editForm.service === 'Others' && (
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
                      <div>
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold capitalize mb-1
                            ${selectedEvent?.status === 'completed' ? 'bg-emerald-100 text-emerald-700' 
                            : selectedEvent?.status === 'canceled' ? 'bg-slate-200 text-slate-600' 
                            : selectedEvent?.status === 'no-show' ? 'bg-red-100 text-red-700'
                            : 'bg-blue-100 text-blue-700'}`}>
                              {selectedEvent?.status}
                          </span>
                          {selectedEvent?.status === 'canceled' && selectedEvent?.cancel_reason && (
                              <p className="text-xs text-slate-500 mt-1"><span className="font-bold text-slate-600">Reason:</span> {selectedEvent.cancel_reason}</p>
                          )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 flex justify-between gap-3 border-t border-slate-100">
              {isEditingEvent ? (
                      <button onClick={() => {
                          if(isNewBooking) { 
                              setSelectedEvent(null); 
                              setIsNewBooking(false); 
                          } else {
                              // Restore the original unedited data including patient_ic
                              setEditForm({
                                  patient_ic: selectedEvent.patient_ic || '', // <--- Added missing property
                                  service: selectedEvent.service,
                                  items: selectedEvent.items || [],
                                  dose: selectedEvent.dose || '',
                                  doctor_ic: selectedEvent.doctor_ic || '',
                                  status: selectedEvent.status,
                                  reason: selectedEvent.reason || ''
                              });
                              setIsEditingEvent(false);
                          }
                      }} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300">Cancel Modify</button>
                  ) : (
                      <button onClick={() => setCancelModalVisible(true)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition-colors">Cancel Booking</button>
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