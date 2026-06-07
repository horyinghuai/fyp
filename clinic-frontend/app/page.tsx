"use client";

import { useState, useEffect } from 'react';
import { Calendar, momentLocalizer, View } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { X, User, Droplet, Activity, Calendar as CalIcon, AlertTriangle, FileText, Search, Bell } from 'lucide-react';
import React from 'react';

const toTitleCase = (str: string) => {
    if (!str) return '';
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
};

const getDoseNum = (name: string): number => {
  if (!name) return 0;
  const n = name.toLowerCase().trim();
  if (n === 'single dose') return 1;
  if (n === 'booster') return 9999;
  const m = n.match(/^dose\s+(\d+)$/);
  return m ? parseInt(m[1]) : 0;
};

const localizer = momentLocalizer(moment);

export default function AdminDashboard() {
  const [activeClinicId, setActiveClinicId] = useState<string>("");
  
  const [events, setEvents] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [vaccinesList, setVaccinesList] = useState<any[]>([]);
  const [bloodTestsList, setBloodTestsList] = useState<any[]>([]);

  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  
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

  const [agentContext, setAgentContext] = useState<any>(null);
  const [aiRec, setAiRec] = useState<any>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);

  const [minDate, setMinDate] = useState(moment().format("YYYY-MM-DD"));
  const [manualDates, setManualDates] = useState<Record<string, string>>({});
  const [vaccineNoHistory, setVaccineNoHistory] = useState(false);
  const [allDoseOptions, setAllDoseOptions] = useState<string[]>([]);

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

  // --- Rescheduling Agent ---
  const [isSystemGenerated, setIsSystemGenerated] = useState<boolean>(false);
  const [rescheduleWarning, setRescheduleWarning] = useState<{
    message: string;
    stagesToCancel: string[];
  } | null>(null);
  const [cascadeCancelReason, setCascadeCancelReason] = useState("Change of schedule");
  const [cascadeCancelCustom, setCascadeCancelCustom] = useState("");
  const [minEditDate, setMinEditDate] = useState<string>(moment().format("YYYY-MM-DD"));
  const minEditDateRef = React.useRef<string>(moment().format("YYYY-MM-DD"));

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

  useEffect(() => {
    if ((isNewBooking || isEditingEvent) && editForm.patient_ic && editForm.service) {
        if (editForm.service === 'Vaccine' && (!editForm.items || editForm.items.length === 0)) return;

        setIsLoadingContext(true);

        const viewStartDate = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
        // For system-generated dose edits, start from the minimum allowed date if later
        const effectiveStart = (isEditingEvent && isSystemGenerated && minEditDateRef.current > viewStartDate)
            ? minEditDateRef.current
            : viewStartDate;

        fetch(`http://127.0.0.1:8000/scheduling-agent/context`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                clinic_id: activeClinicId,
                ic: editForm.patient_ic,
                service_type: editForm.service,
                vaccine_name: editForm.service === 'Vaccine' ? editForm.items[0] : null,
                target_dose: editForm.dose,
                doctor_ic: editForm.doctor_ic || null,
                view_start_date: effectiveStart,
                view_days: 42,
                manual_dates: manualDates  // FIX: pass external clinic dates to date picker
            })
        }).then(r => r.json()).then(data => {
            setAgentContext(data);
            setIsLoadingContext(false);
            if (isNewBooking && data.doctors && data.doctors.length > 0 && (!editForm.doctor_ic || editForm.doctor_ic === 'ANY')) {
                setEditForm(prev => ({...prev, doctor_ic: data.doctors[0].ic}));
            }
        }).catch(err => {
            console.error('Failed to load scheduling context:', err);
            setIsLoadingContext(false);
        });

        // Load AI recommendations for new bookings AND system-generated dose edits
        if (isNewBooking || (isEditingEvent && isSystemGenerated)) {
            fetch(`http://127.0.0.1:8000/recommend-slots`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    clinic_id: activeClinicId,
                    base_date: (isEditingEvent && minEditDateRef.current > moment().format("YYYY-MM-DD"))
                        ? minEditDateRef.current
                        : moment().format("YYYY-MM-DD"),
                    doctor_pref: editForm.doctor_ic || 'ANY',
                    duration: editForm.service === 'Vaccine' ? 15 : 30,
                    service_type: editForm.service,
                    vaccine_name: editForm.service === 'Vaccine' ? editForm.items[0] : null,
                    dose: editForm.dose,
                    ic: editForm.patient_ic,
                    manual_dates: manualDates  // FIX: pass external clinic dates
                })
            }).then(r => r.json()).then(data => {
                if (!data.error) setAiRec(data);
            }).catch(err => console.error('Failed to load AI recommendations:', err));
        } else {
            setAiRec(null);
        }

    } else {
        setAgentContext(null); setAiRec(null); setIsLoadingContext(false);
    }
  }, [isNewBooking, isEditingEvent, isSystemGenerated, activeClinicId, editForm.patient_ic, editForm.service, editForm.items, editForm.dose, editForm.doctor_ic, viewMonth, viewYear, minEditDate]);

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
          // Only show availability for the selected doctor (or all if none chosen)
          if (editForm.doctor_ic && doc.ic_passport_number !== editForm.doctor_ic) return;
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
        // Rescheduling Agent: log the modification
        if (!isNewBooking) {
          const logAction = isSystemGenerated
            ? 'Rescheduling Agent – System-Generated Appointment Modified (Date/Time/Doctor only)'
            : 'Rescheduling Agent – Parent Appointment Modified';
          await fetch(`http://127.0.0.1:8000/admin/agent-log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clinic_id: activeClinicId,
              action: logAction,
              reasoning: `Patient IC: ${selectedEvent?.patient_ic}. Stage: ${selectedEvent?.stage_name || 'N/A'}. Appt ID: ${selectedEvent?.appt_id}. New scheduled time: ${scheduled_time}. Doctor IC: ${editForm.doctor_ic || 'ANY'}.`
            })
          }).catch(() => {});
        }
        window.location.reload(); 
    } catch (err: any) {
        const errorMsg = err?.message || "Failed to connect to backend";
        alert(`Error: ${errorMsg}`);
    }
  };

  const handleCancelClick = () => {
    if (!selectedEvent) return;
    const stageName = selectedEvent.stage_name || selectedEvent.dose || '';
    const dNum = getDoseNum(stageName);
    const service = selectedEvent.service;

    // Non-vaccine or standalone — use regular single-stage cancel modal
    if (service !== 'Vaccine' || dNum === 0) {
      setCancelModalVisible(true);
      return;
    }

    const seriesStages = events
      .filter((e: any) => e.appt_id === selectedEvent.appt_id && e.status !== 'canceled')
      .sort((a: any, b: any) => getDoseNum(a.stage_name) - getDoseNum(b.stage_name));

    let warningMsg = '';
    let stagesToCancel: string[] = [];

    if (dNum === 1) {
      const names = seriesStages.map((s: any) => s.stage_name).join(', ');
      warningMsg = `Cancelling Dose 1 will also cancel ALL future doses in this vaccine series (${names}). This action cannot be undone.`;
      stagesToCancel = seriesStages.map((s: any) => s.id);
    } else if (dNum === 9999) {
      warningMsg = `Cancelling the Booster appointment will remove only the Booster appointment.`;
      stagesToCancel = [selectedEvent.id];
    } else {
      const futureDoses = seriesStages.filter((s: any) => getDoseNum(s.stage_name) >= dNum);
      const futureNames = futureDoses.map((s: any) => s.stage_name).join(', ');
      warningMsg = `Cancelling ${stageName} will also cancel ${futureNames} and leave the vaccine series incomplete.`;
      stagesToCancel = futureDoses.map((s: any) => s.id);
    }

    setCascadeCancelReason("Change of schedule");
    setCascadeCancelCustom("");
    setRescheduleWarning({ message: warningMsg, stagesToCancel });
  };

  const executeCascadeCancellation = async () => {
    if (!rescheduleWarning || !selectedEvent) return;
    const reason = cascadeCancelReason === 'Other' ? cascadeCancelCustom.trim() : cascadeCancelReason;
    if (!reason) { alert('Please provide a cancellation reason.'); return; }

    try {
      for (const stageId of rescheduleWarning.stagesToCancel) {
        await fetch(`http://127.0.0.1:8000/admin/appointment-stages/${stageId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'canceled', cancel_reason: reason })
        });
      }
      await fetch(`http://127.0.0.1:8000/admin/agent-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_id: activeClinicId,
          action: `Rescheduling Agent – Cascade Cancellation (${selectedEvent.stage_name})`,
          reasoning: `Patient IC: ${selectedEvent.patient_ic}. Appt: ${selectedEvent.appt_id}. Cancelled ${rescheduleWarning.stagesToCancel.length} stage(s): [${rescheduleWarning.stagesToCancel.join(', ')}]. Reason: ${reason}`
        })
      }).catch(() => {});

      // Send cancellation notification to patient (use first stage as reference)
      if (rescheduleWarning.stagesToCancel.length > 0) {
        await fetch(`http://127.0.0.1:8000/admin/notify-cancellation`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clinic_id: activeClinicId,
            stage_id: rescheduleWarning.stagesToCancel[0],
            cancel_reason: reason,
            total_cancelled: rescheduleWarning.stagesToCancel.length
          })
        }).catch(() => {});
      }

      setRescheduleWarning(null);
      setSelectedEvent(null);
      window.location.reload();
    } catch (err) {
      alert('Failed to cancel appointment(s). Please try again.');
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

        // Send cancellation notification to patient
        await fetch(`http://127.0.0.1:8000/admin/notify-cancellation`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clinic_id: activeClinicId,
                stage_id: selectedEvent.id,
                cancel_reason: reason,
                total_cancelled: 1
            })
        }).catch(() => {});

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

    // --- Rescheduling Agent: determine type and minimum date ---
    const dNum = getDoseNum(event.stage_name || event.dose || '');
    const sysGen = event.service === 'Vaccine' && dNum >= 2;
    setIsSystemGenerated(sysGen);
    setRescheduleWarning(null);

    let calcMin = moment().format("YYYY-MM-DD");
    if (sysGen) {
      const seriesStages = events
        .filter((e: any) => e.appt_id === event.appt_id && e.status !== 'canceled' && e.id !== event.id)
        .sort((a: any, b: any) => getDoseNum(a.stage_name) - getDoseNum(b.stage_name));
      const prevNum = dNum === 9999
        ? Math.max(...seriesStages.filter((s: any) => getDoseNum(s.stage_name) < 9999).map((s: any) => getDoseNum(s.stage_name)), 0)
        : dNum - 1;
      const prevStage = seriesStages.find((s: any) => getDoseNum(s.stage_name) === prevNum);
      if (prevStage) {
        const vacName = (event.items || [])[0] || '';
        const vac = vaccinesList.find((v: any) => v.name === vacName);
        const targetNum = dNum === 9999 ? ((vac?.total_doses || 0) + 1) : dNum;
        const sched = vac?.schedules?.find((s: any) => s.dose_number === targetNum);
        if (sched?.interval_days) {
          calcMin = moment(prevStage.start).add(sched.interval_days, 'days').format("YYYY-MM-DD");
        }
      }
      // Auto-navigate calendar to the earliest valid month
      if (calcMin > moment().format("YYYY-MM-DD")) {
        const m = moment(calcMin);
        setViewMonth(m.month());
        setViewYear(m.year());
      }
    }
    setMinEditDate(calcMin);
    minEditDateRef.current = calcMin;
  };

  const openNewBookingModal = () => {
    setIsSystemGenerated(false);   // ← ADD
    setMinEditDate(moment().format("YYYY-MM-DD")); // ← ADD
    setRescheduleWarning(null);    // ← ADD
    setViewMonth(new Date().getMonth());   // ← ADD
    setViewYear(new Date().getFullYear()); // ← ADD
    setEditDate(moment().format("YYYY-MM-DD"));
    setMinDate(moment().format("YYYY-MM-DD")); 
    setManualDates({});
    setVaccineNoHistory(false);
    setAllDoseOptions([]);
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

      {/* Rescheduling Agent — Cascade Cancellation Warning Modal */}
        {rescheduleWarning && (
            <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[75] backdrop-blur-sm">
                <div className="bg-white p-6 rounded-2xl shadow-2xl w-[480px]">
                    <div className="flex items-start gap-3 mb-5">
                        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-xl">⚠️</span>
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-slate-800 mb-1">Cancellation Warning</h3>
                            <p className="text-sm text-slate-600 leading-relaxed">{rescheduleWarning.message}</p>
                        </div>
                    </div>

                    <div className="border-t border-slate-100 pt-4 space-y-3">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Reason for Cancellation</label>
                            <select
                                value={cascadeCancelReason}
                                onChange={e => setCascadeCancelReason(e.target.value)}
                                className="w-full p-2 border rounded-lg bg-white outline-none"
                            >
                                <option value="Change of schedule">Change of schedule</option>
                                <option value="Feeling better">Feeling better</option>
                                <option value="Booked wrong service">Booked wrong service</option>
                                <option value="Personal reasons">Personal reasons</option>
                                <option value="Other">Other (Custom)</option>
                            </select>
                        </div>
                        {cascadeCancelReason === 'Other' && (
                            <input
                                type="text"
                                placeholder="Specify reason..."
                                value={cascadeCancelCustom}
                                onChange={e => setCascadeCancelCustom(e.target.value)}
                                className="w-full p-2 border rounded-lg outline-none"
                            />
                        )}
                        <p className="text-xs text-slate-400">
                            This will cancel <strong className="text-slate-600">{rescheduleWarning.stagesToCancel.length}</strong> appointment stage(s). This action cannot be undone.
                        </p>
                    </div>

                    <div className="flex justify-end gap-3 mt-5">
                        <button
                            onClick={() => {
                                setRescheduleWarning(null);
                                setCascadeCancelReason("Change of schedule");
                                setCascadeCancelCustom("");
                            }}
                            className="px-4 py-2 bg-slate-100 rounded-lg text-slate-700 font-medium hover:bg-slate-200"
                        >
                            Back
                        </button>
                        <button
                            onClick={executeCascadeCancellation}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
                        >
                            Confirm Cancellation
                        </button>
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
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                    <CalIcon size={18}/>
                    {isNewBooking ? "Add New Booking" : "Booking Details"}
                    {!isNewBooking && isSystemGenerated && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 ml-1 uppercase tracking-wide">
                            System-Generated
                        </span>
                    )}
                </h3>
              <button onClick={() => { setSelectedEvent(null); setIsNewBooking(false); }} className="text-slate-400 hover:text-red-500"><X size={20}/></button>
            </div>

            <div className="p-6 space-y-4">
              {/* --- 1. PATIENT SELECTION --- */}
              <div className="col-span-2">
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

              {/* Define Disable State based on Patient Selection */}
              {(() => {
                const isPatientSelected = isNewBooking && isCreatingNewPatient 
                    ? (newPatientForm.name && newPatientForm.ic_passport_number && newPatientForm.phone) 
                    : !!editForm.patient_ic;
                const viewOnly = !isNewBooking && !isEditingEvent;
        const isFieldsDisabled = isNewBooking && !isPatientSelected;

        // ── Static read-only view (no form controls shown) ──
        if (viewOnly) {
          const statusColors: Record<string, string> = {
            scheduled: 'bg-blue-100 text-blue-700',
            completed: 'bg-emerald-100 text-emerald-700',
            canceled:  'bg-red-100 text-red-700',
            'no-show': 'bg-amber-100 text-amber-700',
          };
          const statusLabel = editForm.status
            ? editForm.status.charAt(0).toUpperCase() + editForm.status.slice(1)
            : '—';

          return (
            <div className="border-t pt-4">
              <dl className="space-y-2.5 text-sm">
                <div className="flex gap-3">
                  <dt className="w-28 shrink-0 font-semibold text-slate-400 uppercase text-[11px] tracking-wide pt-0.5">Service</dt>
                  <dd className="text-slate-800 font-medium">{editForm.service || '—'}</dd>
                </div>

                {editForm.service === 'Vaccine' && (
                  <>
                    <div className="flex gap-3">
                      <dt className="w-28 shrink-0 font-semibold text-slate-400 uppercase text-[11px] tracking-wide pt-0.5">Vaccine</dt>
                      <dd className="text-slate-800">{editForm.items[0] || '—'}</dd>
                    </div>
                    <div className="flex gap-3">
                      <dt className="w-28 shrink-0 font-semibold text-slate-400 uppercase text-[11px] tracking-wide pt-0.5">Dose</dt>
                      <dd className="text-slate-800">{editForm.dose || '—'}</dd>
                    </div>
                  </>
                )}

                {editForm.service === 'Blood Test' && (
                  <div className="flex gap-3">
                    <dt className="w-28 shrink-0 font-semibold text-slate-400 uppercase text-[11px] tracking-wide pt-0.5">Tests</dt>
                    <dd className="text-slate-800">{editForm.items.join(', ') || '—'}</dd>
                  </div>
                )}

                {editForm.service === 'Others' && (
                  <div className="flex gap-3">
                    <dt className="w-28 shrink-0 font-semibold text-slate-400 uppercase text-[11px] tracking-wide pt-0.5">Reason</dt>
                    <dd className="text-slate-800">{editForm.reason || '—'}</dd>
                  </div>
                )}

                <div className="flex gap-3">
                  <dt className="w-28 shrink-0 font-semibold text-slate-400 uppercase text-[11px] tracking-wide pt-0.5">Doctor</dt>
                  <dd className="text-slate-800">{selectedEvent?.doctor || 'Not Assigned'}</dd>
                </div>

                <div className="flex gap-3">
                  <dt className="w-28 shrink-0 font-semibold text-slate-400 uppercase text-[11px] tracking-wide pt-0.5">Date</dt>
                  <dd className="text-slate-800">{editDate ? moment(editDate).format('D MMMM YYYY (ddd)') : '—'}</dd>
                </div>

                <div className="flex gap-3">
                  <dt className="w-28 shrink-0 font-semibold text-slate-400 uppercase text-[11px] tracking-wide pt-0.5">Time</dt>
                  <dd className="text-slate-800">
                    {editTime || (selectedEvent ? moment(selectedEvent.start).format('HH:mm') : '—')}
                  </dd>
                </div>

                <div className="flex gap-3 items-start">
                  <dt className="w-28 shrink-0 font-semibold text-slate-400 uppercase text-[11px] tracking-wide pt-0.5">Status</dt>
                  <dd>
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${statusColors[editForm.status] || 'bg-slate-100 text-slate-600'}`}>
                      {statusLabel}
                    </span>
                  </dd>
                </div>

                {editForm.status === 'canceled' && selectedEvent?.cancel_reason && (
                  <div className="flex gap-3">
                    <dt className="w-28 shrink-0 font-semibold text-slate-400 uppercase text-[11px] tracking-wide pt-0.5">Cancel Reason</dt>
                    <dd className="text-red-600">{selectedEvent.cancel_reason}</dd>
                  </div>
                )}
              </dl>
            </div>
          );
        }

        return (
        <div className={`space-y-4 border-t pt-4 transition-opacity ${isFieldsDisabled ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                      
                      {/* --- 2. SERVICE TYPE --- */}
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Service Type</label>
                        <select 
                            value={editForm.service} 
                            disabled={isSystemGenerated}
                            onChange={(e) => {
                                setEditForm({...editForm, service: e.target.value, items: [], doctor_ic: ''});
                                setEditTime("");
                            }} 
                            className="w-full p-2 border rounded-lg bg-white outline-none disabled:bg-slate-100 disabled:text-slate-500"
                        >
                          <option value="Others">Others</option>
                          <option value="Vaccine">Vaccine</option>
                          <option value="Blood Test">Blood Test</option>
                        </select>
                      </div>

                      {/* Rescheduling Agent: inform user of restrictions */}
                      {!isNewBooking && isSystemGenerated && isEditingEvent && (
                        <div className="col-span-2 flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-700 font-medium">
                            <span>🔒</span>
                            <span>System-generated appointment: only <strong>Date</strong>, <strong>Time</strong>, and <strong>Doctor</strong> can be modified.</span>
                        </div>
                      )}

                      {/* --- 3. SERVICE DETAILS --- */}
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 col-span-2">
                          {editForm.service === 'Vaccine' && (
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Vaccine Name</label>
                                <select 
                                    value={editForm.items[0] || ''} 
                                    disabled={isSystemGenerated}
                                    onChange={async e => {
                                        const val = e.target.value;
                                        setVaccineNoHistory(false);
                                        setAllDoseOptions([]);
                                        setManualDates({});
                                        setEditForm(prev => ({...prev, items: [val], dose: 'Calculating...'}));

                                        if (!val) {
                                            setEditForm(prev => ({...prev, items: [], dose: ''}));
                                            return;
                                        }

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
                                                        setEditForm(prev => ({...prev, items: [], dose: ''}));
                                                    } else if (data.type_disabled) {
                                                        // Full series done and repeat not allowed / interval not passed
                                                        alert(`🚫 ${val} is not available for this patient.\n${data.disable_reason}`);
                                                        setEditForm(prev => ({...prev, items: [], dose: ''}));
                                                    } else if (data.no_history) {
                                                        // No prior doses — let staff pick any dose
                                                        setVaccineNoHistory(true);
                                                        setAllDoseOptions(data.all_dose_options || []);
                                                        const firstDose = (data.all_dose_options || [])[0] || data.next_dose || 'Dose 1';
                                                        setEditForm(prev => ({...prev, items: [val], dose: firstDose}));
                                                    } else if (data.next_dose) {
                                                        // History exists — auto-determine dose
                                                        setVaccineNoHistory(false);
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
                                <label className="block text-xs font-bold text-slate-500 mb-1">
                                  {vaccineNoHistory && isNewBooking ? 'Dose Sequence (Select)' : 'Dose Sequence (Auto-Determined)'}
                                </label>
                                {vaccineNoHistory && isNewBooking ? (
                                  <select
                                    value={editForm.dose}
                                    onChange={async e => {
                                      const selectedDose = e.target.value;
                                      setEditForm(prev => ({...prev, dose: selectedDose}));

                                      // Collect missing prior dose dates for external_vaccine_record
                                      const getDoseNum = (name: string) => {
                                        if (name === 'Single Dose') return 1;
                                        if (name === 'Booster') return 999;
                                        const m = name.match(/Dose (\d+)/);
                                        return m ? parseInt(m[1]) : 0;
                                      };
                                      const selectedNum = getDoseNum(selectedDose);
                                      if (selectedNum > 1 && selectedNum !== 999) {
                                        // Ask for all prior doses that are not Booster
                                        const newManualDates: Record<string, string> = {};
                                        for (let i = 1; i < selectedNum; i++) {
                                          const priorDoseName = allDoseOptions[i - 1] || `Dose ${i}`;
                                          let validDate = false;
                                          while (!validDate) {
                                            const entered = window.prompt(
                                              `Patient has no recorded history.\nPlease enter the date for ${priorDoseName} taken at another clinic (YYYY-MM-DD):`
                                            );
                                            if (entered === null) {
                                              // User cancelled — revert to first dose
                                              setEditForm(prev => ({...prev, dose: allDoseOptions[0] || 'Dose 1'}));
                                              return;
                                            }
                                            if (/^\d{4}-\d{2}-\d{2}$/.test(entered)) {
                                              newManualDates[priorDoseName] = entered;
                                              validDate = true;
                                            } else {
                                              alert('❌ Invalid date format. Please use YYYY-MM-DD.');
                                            }
                                          }
                                        }
                                        setManualDates(prev => ({...prev, ...newManualDates}));
                                      } else {
                                        // First dose selected — clear any previously entered manual dates
                                        setManualDates({});
                                      }
                                    }}
                                    className="w-full p-2 border rounded-lg bg-white outline-none font-bold text-blue-700"
                                  >
                                    {allDoseOptions.map(opt => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <input type="text" value={editForm.dose} disabled className="w-full p-2 border rounded-lg bg-slate-100 outline-none text-slate-500 font-bold" />
                                )}
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

                      {/* --- 4. AI RECOMMENDATION BOX --- */}
                      {(isNewBooking || (isEditingEvent && isSystemGenerated)) && aiRec && (
                          <div className="col-span-2 mb-4 bg-indigo-50 border border-indigo-200 rounded-xl p-4 shadow-sm relative overflow-hidden">
                              <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                              <div className="flex items-center gap-2 mb-2">
                                  <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wide uppercase shadow-sm">AI Recommendation</span>
                                  <span className="text-indigo-800 text-xs font-bold">Scheduling Agent</span>
                              </div>
                              <div className="text-sm text-indigo-900 mb-3">
                                  <div className="font-semibold text-lg flex items-center gap-2">
                                      {aiRec.recommended_doctor} <span className="text-sm">⭐⭐⭐</span>
                                  </div>
                                  <div className="opacity-90">{moment(aiRec.raw_date).format("D MMMM YYYY")} at {aiRec.raw_time.substring(0,5)}</div>
                                  <div className="mt-2 text-xs italic opacity-80 border-l-2 border-indigo-300 pl-2">"{aiRec.reasoning}"</div>
                              </div>
                              <button type="button" onClick={() => {
                                  const docObj = doctors.find((d:any) => d.name === aiRec.recommended_doctor);
                                  setEditForm(prev => ({...prev, doctor_ic: docObj ? docObj.ic_passport_number : ''}));
                                  setEditDate(aiRec.raw_date);
                                  setEditTime(aiRec.raw_time.substring(0,5));
                              }} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg transition-colors text-sm shadow-sm">
                                  Use AI Recommendation
                              </button>
                          </div>
                      )}

                      {/* --- 5. ASSIGNED DOCTOR --- */}
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Assigned Doctor <span className="text-red-500">*</span></label>
                        <select value={editForm.doctor_ic} onChange={(e) => {
                            setEditForm({...editForm, doctor_ic: e.target.value});
                            setEditDate(""); setEditTime("");
                        }} className="w-full p-2 border rounded-lg bg-white outline-none">
                          <option value="">-- Select a Doctor --</option>
                          {doctors.map((doc: any) => {
                              const aiLabel = agentContext?.doctors?.find((d: any) => d.ic === doc.ic_passport_number)?.label;
                              return (
                                  <option key={doc.ic_passport_number} value={doc.ic_passport_number}>
                                      {doc.name} {aiLabel ? `${aiLabel}` : ""}
                                  </option>
                              );
                          })}
                        </select>
                      </div>

                      {/* --- 6. CUSTOM COLOR-CODED DATE PICKER --- */}
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Select Date</label>
                        {!editForm.doctor_ic ? (
                            <div className="text-sm text-slate-500 italic p-4 bg-slate-50 rounded-lg text-center border border-dashed">Please select a doctor first</div>
                        ) : isLoadingContext ? (
                            <div className="text-sm text-slate-500 italic p-4 bg-slate-50 rounded-lg text-center border border-dashed">Loading available dates...</div>
                        ) : agentContext?.dates ? (
                            <div>
                                {/* Legend */}
                                <div className="flex items-center gap-3 mb-3 flex-wrap text-xs">
                                    <div className="flex items-center gap-1"><div className="w-3.5 h-3.5 bg-green-400 rounded border border-green-600"></div><span>Low Load</span></div>
                                    <div className="flex items-center gap-1"><div className="w-3.5 h-3.5 bg-yellow-300 rounded border border-yellow-600"></div><span>Medium</span></div>
                                    <div className="flex items-center gap-1"><div className="w-3.5 h-3.5 bg-red-400 rounded border border-red-600"></div><span>Busy</span></div>
                                    <div className="flex items-center gap-1"><div className="w-3.5 h-3.5 bg-slate-300 rounded border border-slate-400"></div><span>Unavailable</span></div>
                                </div>

                                {/* Rescheduling Agent: minimum date notice for dose 2+ */}
                                {!isNewBooking && isSystemGenerated && minEditDate > moment().format("YYYY-MM-DD") && (
                                    <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 font-semibold">
                                        <span>📅</span>
                                        <span>Earliest allowed date (interval requirement): <strong>{moment(minEditDate).format("D MMMM YYYY")}</strong></span>
                                    </div>
                                )}

                                {/* Month / Year Navigation */}
                                <div className="flex items-center justify-between mb-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const d = new Date(viewYear, viewMonth - 1, 1);
                                            setViewMonth(d.getMonth());
                                            setViewYear(d.getFullYear());
                                        }}
                                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-base shadow-sm"
                                    >‹</button>

                                    <div className="flex items-center gap-2">
                                        <select
                                            value={viewMonth}
                                            onChange={e => setViewMonth(parseInt(e.target.value))}
                                            className="p-1 border border-slate-200 rounded-lg text-sm outline-none bg-white font-semibold text-slate-700"
                                        >
                                            {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                                                <option key={i} value={i}>{m}</option>
                                            ))}
                                        </select>
                                        <select
                                            value={viewYear}
                                            onChange={e => setViewYear(parseInt(e.target.value))}
                                            className="p-1 border border-slate-200 rounded-lg text-sm outline-none bg-white font-semibold text-slate-700"
                                        >
                                            {[new Date().getFullYear(), new Date().getFullYear() + 1, new Date().getFullYear() + 2].map(y => (
                                                <option key={y} value={y}>{y}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            const d = new Date(viewYear, viewMonth + 1, 1);
                                            setViewMonth(d.getMonth());
                                            setViewYear(d.getFullYear());
                                        }}
                                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-base shadow-sm"
                                    >›</button>
                                </div>

                                {/* Day-of-week headers */}
                                <div className="grid grid-cols-7 gap-1 mb-1">
                                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                                        <div key={d} className="text-center text-[10px] font-bold text-slate-400 py-0.5">{d}</div>
                                    ))}
                                </div>

                                {/* Calendar grid */}
                                <div className="grid grid-cols-7 gap-1">
                                    {(() => {
                                        const todayDate = new Date();
                                        todayDate.setHours(0, 0, 0, 0);

                                        const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
                                        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

                                        // Build a quick lookup map from the backend response
                                        const dateMap = new Map<string, any>(
                                            (agentContext.dates as any[]).map((d: any) => [d.date, d])
                                        );

                                        const cells: React.ReactElement[] = [];

                                        // Leading empty cells
                                        for (let i = 0; i < firstDayOfWeek; i++) {
                                            cells.push(<div key={`empty-${i}`} className="min-h-[42px]" />);
                                        }

                                        // Day cells
                                        for (let day = 1; day <= daysInMonth; day++) {
                                            const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                            const cellDate = new Date(viewYear, viewMonth, day);
                                            const isPast = cellDate < todayDate;
                                            const isBelowMin = cellDate < new Date(minEditDate + 'T00:00:00');
                                            const dateInfo = dateMap.get(dateStr);
                                            const isSelected = editDate === dateStr;

                                            let bgColor = "bg-slate-100 text-slate-300";
                                            let borderColor = "border-slate-200";
                                            let hoverClass = "cursor-not-allowed";
                                            let isDisabled = true;

                                            if (!isPast && !isBelowMin) {
                                                if (dateInfo && !dateInfo.disabled) {
                                                    isDisabled = false;
                                                    if (dateInfo.status === "Green") {
                                                        bgColor = "bg-green-100 text-green-900";
                                                        borderColor = "border-green-300";
                                                        hoverClass = "hover:bg-green-200 cursor-pointer";
                                                    } else if (dateInfo.status === "Yellow") {
                                                        bgColor = "bg-yellow-100 text-yellow-900";
                                                        borderColor = "border-yellow-300";
                                                        hoverClass = "hover:bg-yellow-200 cursor-pointer";
                                                    } else if (dateInfo.status === "Red") {
                                                        bgColor = "bg-red-100 text-red-900";
                                                        borderColor = "border-red-300";
                                                        hoverClass = "hover:bg-red-200 cursor-pointer";
                                                    }
                                                    // Grey (disabled) falls through to defaults
                                                }
                                                // dates not yet fetched (future months beyond range) stay grey/disabled
                                            }

                                            cells.push(
                                                <button
                                                    key={dateStr}
                                                    type="button"
                                                    disabled={isDisabled}
                                                    onClick={() => {
                                                        setEditDate(dateStr);
                                                        setEditTime("");
                                                    }}
                                                    className={`
                                                        min-h-[42px] rounded border transition-all text-xs font-semibold
                                                        flex flex-col items-center justify-center
                                                        ${isSelected ? "ring-2 ring-blue-500 ring-offset-1 shadow-md" : ""}
                                                        ${bgColor} ${borderColor} ${hoverClass}
                                                    `}
                                                >
                                                    <span className="text-sm font-bold">{day}</span>
                                                </button>
                                            );
                                        }
                                        return cells;
                                    })()}
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-red-500 italic p-4 bg-red-50 rounded-lg text-center border border-red-300 border-dashed">Failed to load dates. Please try again.</div>
                        )}
                      </div>

                      {/* --- 7. TIME SELECTION --- */}
                      {editDate && editForm.doctor_ic ? (
                          <div className="col-span-2">
                              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Select Time</label>
                              {availableTimes.length > 0 ? (
                                  <div className="grid grid-cols-4 gap-2">
                                      {availableTimes.map((t: string, idx: number) => {
                                          let stars = "";
                                          if (isNewBooking && aiRec) {
                                              if (aiRec.raw_time && aiRec.raw_time.substring(0,5) === t.substring(0,5) && editDate === aiRec.raw_date) stars = "⭐⭐⭐";
                                              else if (aiRec.alternative_slots?.some((s:any) => s.formatted_time && s.formatted_time.substring(0,5) === t.substring(0,5) && s.date_str === editDate)) stars = "⭐⭐";
                                          }
                                          return (
                                              <button key={idx} type="button" onClick={() => setEditTime(t.substring(0, 5))}
                                              className={`p-2 border rounded-lg text-sm transition-all flex flex-col items-center justify-center ${editTime === t.substring(0, 5) ? "bg-indigo-600 text-white border-indigo-600 shadow-md font-bold" : "bg-slate-50 text-slate-700 hover:bg-indigo-50 border-slate-200"}`}>
                                                  <span>{t.substring(0, 5)}</span>
                                                  {stars && <span className="text-[9px] mt-0.5 tracking-tighter">{stars}</span>}
                                              </button>
                                          )
                                      })}
                                  </div>
                              ) : (
                                  <div className="text-sm text-slate-500 italic p-4 bg-slate-50 rounded-lg text-center border border-dashed">No available slots for this date.</div>
                              )}
                          </div>
                      ) : null}

                      {/* --- 8. STATUS / CANCEL REASON (ONLY IF EDITING) --- */}
                      {!isNewBooking && (
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Booking Status</label>
                            <select value={editForm.status} onChange={(e) => setEditForm({...editForm, status: e.target.value})} className="w-full p-2 border rounded-lg bg-white outline-none mb-2">
                                <option value="scheduled">Scheduled</option>
                                <option value="completed">Completed</option>
                                <option value="no-show">No-Show</option>
                                <option value="canceled">Canceled</option>
                            </select>
                            
                            {editForm.status === 'canceled' && (
                              <div className="col-span-2 mt-2 border-t pt-2">
                                  <label className="block text-xs font-bold text-red-500 uppercase mb-1">Cancellation Reason <span className="text-red-500">*</span></label>
                                  <select
                                      value={["Change of schedule", "Feeling better", "Booked wrong service", "Personal reasons"].includes(inlineCancelReason) ? inlineCancelReason : (inlineCancelReason ? "Other" : "")}
                                      onChange={(e) => {
                                          if (e.target.value !== "Other") {
                                              setInlineCancelReason(e.target.value);
                                          } else {
                                              setInlineCancelReason("");
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
                        </div>
                      )}
                  </div>
                );
              })()}
            </div>

            <div className="px-6 py-4 bg-slate-50 flex justify-between gap-3 border-t border-slate-100">
              {isEditingEvent ? (
                      <button onClick={() => {
                          if(isNewBooking) { 
                              setSelectedEvent(null); 
                              setIsNewBooking(false); 
                          } else {
                              setEditForm({
                                  patient_ic: selectedEvent.patient_ic || '',
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
                      <button
                        onClick={handleCancelClick}
                        disabled={editForm.status === 'completed'}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                          editForm.status === 'completed'
                            ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                            : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        }`}
                      >
                        Cancel Booking
                      </button>
                  )}
              
              {isEditingEvent ? (
                <button onClick={handleUpdateOrAddEvent} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium">{isNewBooking ? "Create Booking" : "Save Changes"}</button>
              ) : (
                <button
                  onClick={() => setIsEditingEvent(true)}
                  disabled={editForm.status === 'completed'}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    editForm.status === 'completed'
                      ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  Modify Booking
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}