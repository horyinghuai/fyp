"use client";

import { useState, useEffect, useRef } from 'react';
import { Camera, FileUp } from 'lucide-react';
import { Eye, Calendar, X, AlertTriangle } from 'lucide-react';
import moment from 'moment';

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

  const [agentContext, setAgentContext] = useState<any>(null);
  const [aiRec, setAiRec] = useState<any>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);

  const [minDate, setMinDate] = useState(moment().format("YYYY-MM-DD"));
  const [manualDates, setManualDates] = useState<Record<string, string>>({});
  const [vaccineNoHistory, setVaccineNoHistory] = useState(false);
  const [allDoseOptions, setAllDoseOptions] = useState<string[]>([]);
  const [restartSeries, setRestartSeries] = useState(false);

  const [isSystemGenerated, setIsSystemGenerated] = useState<boolean>(false);
  const [minEditDate, setMinEditDate] = useState<string>(moment().format("YYYY-MM-DD"));
  const minEditDateRef = useRef<string>(moment().format("YYYY-MM-DD"));
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());

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

  const manualDatesKey = Object.entries(manualDates).map(([k, v]) => `${k}:${v}`).join('|');

  useEffect(() => {
    if (isEditingAppt && editForm.service) {
        if (editForm.service === 'Vaccine' && (!editForm.items || editForm.items.length === 0)) return;
        if (editForm.service === 'Vaccine' && editForm.dose === 'Calculating...') {
            setAiRec(null);
            return;
        }

        setIsLoadingContext(true);

        const viewStartDate = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
        const effectiveStart = (isSystemGenerated && minEditDateRef.current > viewStartDate)
            ? minEditDateRef.current
            : viewStartDate;

        fetch(`http://127.0.0.1:8000/scheduling-agent/context`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                clinic_id: clinicId,
                ic: selectedApptDetail?.patient_ic,
                service_type: editForm.service,
                vaccine_name: editForm.service === 'Vaccine' ? editForm.items[0] : null,
                target_dose: editForm.dose,
                doctor_ic: editForm.doctor_ic || null,
                view_start_date: effectiveStart,
                view_days: 42,
                manual_dates: manualDates
            })
        }).then(r => r.json()).then(data => {
            setAgentContext(data);
            setIsLoadingContext(false);
        }).catch(err => {
            setIsLoadingContext(false);
        });

        if (isSystemGenerated) {
            fetch(`http://127.0.0.1:8000/recommend-slots`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    clinic_id: clinicId,
                    base_date: (minEditDateRef.current > moment().format("YYYY-MM-DD"))
                        ? minEditDateRef.current
                        : moment().format("YYYY-MM-DD"),
                    doctor_pref: editForm.doctor_ic || 'ANY',
                    duration: editForm.service === 'Vaccine' ? 15 : 30,
                    service_type: editForm.service,
                    vaccine_name: editForm.service === 'Vaccine' ? editForm.items[0] : null,
                    dose: editForm.dose,
                    ic: selectedApptDetail?.patient_ic,
                    manual_dates: manualDates,
                    original_appt_id: selectedApptDetail ? selectedApptDetail.appt_id : null
                })
            }).then(r => r.json()).then(data => {
                if (!data.error) setAiRec(data);
                else setAiRec(null);
            }).catch(err => setAiRec(null));
        } else {
            setAiRec(null);
        }
    } else {
        setAgentContext(null); setAiRec(null); setIsLoadingContext(false);
    }
  }, [isEditingAppt, isSystemGenerated, clinicId, selectedApptDetail, editForm.service, editForm.items, editForm.dose, editForm.doctor_ic, viewMonth, viewYear, minEditDate, manualDatesKey]);

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
      const dayOfWeek = moment(editDate).format("ddd").toLowerCase();
      const duration = editForm.service === 'Vaccine' ? 15 : 30;
      const now = moment();
      const isToday = moment(editDate).isSame(now, 'day');

      const timesSet = new Set<string>();
      const docsForTime: Record<string, any[]> = {};

      doctors.forEach(doc => {
          if (editForm.doctor_ic && doc.ic_passport_number !== editForm.doctor_ic) return;
          if (!doc.schedules) return;
          const todayScheds = doc.schedules.filter((s: any) => s.day_of_week && s.day_of_week.toLowerCase() === dayOfWeek);
          
          todayScheds.forEach((sched: any) => {
              let curr = moment(`${editDate} ${sched.start_time}`);
              const end = moment(`${editDate} ${sched.end_time}`);
              
              while (curr.clone().add(duration, 'minutes').isSameOrBefore(end)) {
                  const timeStr = curr.format("HH:mm");
                  const slotStart = curr.clone();
                  
                  const isCurrentEventTime = selectedApptDetail && moment(`${selectedApptDetail.date} ${selectedApptDetail.time}`).format("HH:mm") === timeStr && selectedApptDetail.date === editDate;

                  if (isToday && slotStart.isSameOrBefore(now) && !isCurrentEventTime) {
                      curr.add(duration, 'minutes');
                      continue;
                  }

                  timesSet.add(timeStr);
                  if (!docsForTime[timeStr]) docsForTime[timeStr] = [];
                  if (!docsForTime[timeStr].some(d => d.ic_passport_number === doc.ic_passport_number)) {
                      docsForTime[timeStr].push(doc);
                  }
                  curr.add(duration, 'minutes');
              }
          });
      });
      return { times: Array.from(timesSet).sort(), docsForTime };
  };

  const handleUpdateEvent = async () => {
    try {
        if (!editDate || !editTime || !editForm.doctor_ic) return alert("Please select Date, Time, and Doctor.");

        const scheduled_time = `${editDate} ${editTime}:00`;

        const isDateTimeUnchanged = selectedApptDetail &&
              editDate === selectedApptDetail.date && 
              editTime === selectedApptDetail.time.substring(0,5);

        if (editForm.service === "Vaccine" && editForm.items.length > 0 && !isDateTimeUnchanged && !restartSeries) {
            let tempIc = selectedApptDetail.patient_ic;
            if (tempIc) {
                let isValidated = false;
                let currentManualDates = { ...manualDates };
                
                while (!isValidated) {
                    try {
                        const valRes = await fetch(`http://127.0.0.1:8000/validate-vaccine-booking`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                clinic_id: clinicId, ic: tempIc,
                                vaccine_name: editForm.items[0], target_dose: editForm.dose,
                                requested_time: scheduled_time, manual_dates: currentManualDates,
                                exclude_stage_id: selectedApptDetail.stage_id || selectedApptDetail.id,
                                restart_series: restartSeries   
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
                                        continue; 
                                    } else {
                                        alert(`You previously missed this dose. You should continue with ${valData.ask_external_yes_no}.`);
                                        editForm.dose = valData.ask_external_yes_no;
                                        break; 
                                    }
                                } else {
                                    alert(`⚠️ Vaccine Agent Validation Failed:\n${valData.reason}`);
                                    const needsRestart = valData.restart_required ||
                                        (valData.reason && valData.reason.toLowerCase().includes('must be restarted'));
                                    if (needsRestart) {
                                        const vac = vaccinesList.find((v: any) => v.name === editForm.items[0]);
                                        const firstDose = vac && vac.total_doses > 1 ? 'Dose 1' : 'Single Dose';
                                        const freshOptions: string[] = [];
                                        if (vac) {
                                            if (vac.total_doses === 1) freshOptions.push('Single Dose');
                                            else for (let i = 1; i <= vac.total_doses; i++) freshOptions.push(`Dose ${i}`);
                                            if (vac.has_booster) freshOptions.push('Booster');
                                        }
                                        setManualDates({});
                                        setVaccineNoHistory(true);
                                        setAllDoseOptions(freshOptions);
                                        setRestartSeries(true);
                                        setEditForm((prev: any) => ({ ...prev, dose: firstDose }));
                                        setEditDate("");
                                        setEditTime("");
                                    }
                                    return;
                                }
                            } else {
                                editForm.dose = valData.target_dose;
                                isValidated = true;
                            }
                        } else isValidated = true;
                    } catch (e) { isValidated = true; }
                }
            }
        }
        
        if(!window.confirm("Are you sure this details are correct?")) return;

        if (editForm.status === 'no-show') {
            const stageRes = await fetch(
                `http://127.0.0.1:8000/admin/appointment-stages/${selectedApptDetail.stage_id || selectedApptDetail.id}`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'no-show' })
                }
            );
            if (!stageRes.ok) throw new Error('Failed to mark appointment as no-show');
            window.location.reload();
            return;
        }

        const payload: any = {
            appt_id: selectedApptDetail.appt_id, 
            service_type: editForm.service,
            details: {
                items: editForm.items, dose: editForm.dose, total_doses: 1, assigned_doctor_id: editForm.doctor_ic, general_notes: editForm.reason, manual_dates: manualDates
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

        const logAction = isSystemGenerated
            ? 'Rescheduling Agent – System-Generated Appointment Modified (Date/Time/Doctor only)'
            : 'Rescheduling Agent – Parent Appointment Modified';
        await fetch(`http://127.0.0.1:8000/admin/agent-log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clinic_id: clinicId,
                action: logAction,
                reasoning: `Patient IC: ${selectedApptDetail?.patient_ic}. Stage: ${selectedApptDetail?.dose || 'N/A'}. Appt ID: ${selectedApptDetail?.appt_id}. New scheduled time: ${scheduled_time}. Doctor IC: ${editForm.doctor_ic || 'ANY'}.`
            })
        }).catch(() => {});

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

  const groupedVaccines = vaccinesList.reduce((acc: any, v: any) => {
    let type = (v.type || "Other").trim();
    if (type.toLowerCase().includes("hepatitis b")) type = "Hepatitis B"; 
    if (!acc[type]) acc[type] = [];
    acc[type].push(v); return acc;
  }, {} as Record<string, any[]>);

  const pkgs = bloodTestsList.filter((b: any) => b.test_type === 'package');
  const sgls = bloodTestsList.filter((b: any) => b.test_type === 'single');
  
  const selectedPkgs = pkgs.filter((p: any) => editForm.items?.includes(p.name));
  const includedTestNames = new Set<string>();
  selectedPkgs.forEach((p: any) => {
      if (p.included_tests) p.included_tests.forEach((t: string) => includedTestNames.add(t));
  });
  const hasOnePackageSelected = selectedPkgs.length > 0;
  
  const { times: availableTimes, docsForTime } = getAvailableSlots();

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
                              {/* --- PATIENT NAME --- */}
                              <div className="col-span-2 border-b border-slate-200 pb-4">
                                <div className="flex justify-between items-end mb-1">
                                    <label className="block text-xs font-bold text-slate-400 uppercase">Patient</label>
                                </div>
                                <div className="font-bold text-slate-800 text-lg uppercase">{selectedApptDetail.patient_name}</div>
                              </div>

                              {/* --- SERVICE TYPE --- */}
                              <div className="col-span-2 !mt-[3px]">
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

                              {isSystemGenerated && isEditingAppt && (
                                <div className="col-span-2 flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-700 font-medium">
                                    <span>🔒</span>
                                    <span>System-generated appointment: only <strong>Date</strong>, <strong>Time</strong>, and <strong>Doctor</strong> can be modified.</span>
                                </div>
                              )}

                              {/* --- SERVICE DETAILS --- */}
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
                                                setRestartSeries(false);
                                                setEditForm((prev: any) => ({...prev, items: [val], dose: 'Calculating...'}));

                                                if (!val) {
                                                    setEditForm((prev: any) => ({...prev, items: [], dose: ''}));
                                                    return;
                                                }

                                                if (val && selectedApptDetail?.patient_ic) {
                                                    try {
                                                        const res = await fetch(`http://127.0.0.1:8000/patients/${selectedApptDetail.patient_ic}/next-vaccine-dose/${encodeURIComponent(val)}?clinic_id=${clinicId}`);
                                                        if (res.ok) {
                                                            const data = await res.json();
                                                            if (data.is_brand_switch) {
                                                                alert(`⚠️ Brand Switch Detected:\nYou started a cycle with ${data.active_brand}. You must complete that cycle before switching to ${val}.`);
                                                                setEditForm((prev: any) => ({...prev, items: [], dose: ''}));
                                                            } else if (data.type_disabled) {
                                                                alert(`🚫 ${val} is not available for this patient.\n${data.disable_reason}`);
                                                                setEditForm((prev: any) => ({...prev, items: [], dose: ''}));
                                                            } else if (data.series_expired) {
                                                                alert("Your previous vaccine series has expired and must be restarted. Please select Dose 1 instead.");
                                                                const firstDose = data.next_dose || 'Dose 1';
                                                                setVaccineNoHistory(false);
                                                                setAllDoseOptions([]);
                                                                setManualDates({});
                                                                setRestartSeries(true);
                                                                setEditForm((prev: any) => ({...prev, items: [val], dose: firstDose}));
                                                            } else if (data.no_history) {
                                                                setVaccineNoHistory(true);
                                                                setAllDoseOptions(data.all_dose_options || []);
                                                                const firstDose = (data.all_dose_options || [])[0] || data.next_dose || 'Dose 1';
                                                                setEditForm((prev: any) => ({...prev, items: [val], dose: firstDose}));
                                                            } else if (data.next_dose) {
                                                                setVaccineNoHistory(false);
                                                                setEditForm((prev: any) => ({...prev, items: [val], dose: data.next_dose}));
                                                            }
                                                        }
                                                    } catch (err) {}
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
                                          {vaccineNoHistory ? 'Dose Sequence (Select)' : 'Dose Sequence'}
                                        </label>
                                        {vaccineNoHistory ? (
                                          <select
                                            value={editForm.dose}
                                            onChange={async e => {
                                              const selectedDose = e.target.value;
                                              setEditForm((prev: any) => ({...prev, dose: selectedDose}));
                                              const getDoseNumLocal = (name: string) => {
                                                if (name === 'Single Dose') return 1;
                                                if (name === 'Booster') return 999;
                                                const m = name.match(/Dose (\d+)/);
                                                return m ? parseInt(m[1]) : 0;
                                              };
                                              const selectedNum = getDoseNumLocal(selectedDose);
                                              if (selectedNum > 1 && selectedNum !== 999) {
                                                const firstDoseName = allDoseOptions[0] || 'Dose 1';
                                                const newManualDates: Record<string, string> = {};
                                                let i = 1;
                                                while (i < selectedNum) {
                                                  const priorDoseName = allDoseOptions[i - 1] || `Dose ${i}`;
                                                  const entered = window.prompt(`Patient has no recorded history.\nPlease enter the date for ${priorDoseName} taken at another clinic (YYYY-MM-DD):`);
                                                  if (entered === null) { setEditForm((prev: any) => ({...prev, dose: firstDoseName})); return; }
                                                  if (!/^\d{4}-\d{2}-\d{2}$/.test(entered)) { alert('❌ Invalid date format. Please use YYYY-MM-DD.'); continue; }
                                                  if (i > 1) {
                                                    const prevDoseName = allDoseOptions[i - 2] || `Dose ${i - 1}`;
                                                    const prevDateStr = newManualDates[prevDoseName];
                                                    if (prevDateStr && moment(prevDateStr).isAfter(moment(entered), 'day')) {
                                                      alert(`⚠️ The ${prevDoseName} date (${prevDateStr}) cannot be later than the ${priorDoseName} date (${entered}).\n\nPlease re-enter the dates starting from ${firstDoseName}.`);
                                                      Object.keys(newManualDates).forEach(k => delete newManualDates[k]);
                                                      i = 1; continue;
                                                    }
                                                  }
                                                  newManualDates[priorDoseName] = entered;
                                                  i++;
                                                }
                                                setManualDates((prev: any) => ({...prev, ...newManualDates}));
                                                const vac = vaccinesList.find((v: any) => v.name === editForm.items[0]);
                                                if (vac && vac.restart_if_interrupted && vac.interruption_restart_days != null) {
                                                  const prevName = allDoseOptions[selectedNum - 2] || `Dose ${selectedNum - 1}`;
                                                  const prevDateStr = newManualDates[prevName];
                                                  if (prevDateStr) {
                                                    const expiry = moment(prevDateStr).add(vac.interruption_restart_days, 'days');
                                                    if (moment().isAfter(expiry, 'day')) {
                                                      alert("Your previous vaccine series has expired and must be restarted. Please select Dose 1 instead.");
                                                      const firstDose = vac.total_doses > 1 ? 'Dose 1' : 'Single Dose';
                                                      setVaccineNoHistory(false);
                                                      setAllDoseOptions([]);
                                                      setManualDates({});
                                                      setRestartSeries(true);
                                                      setEditForm((prev: any) => ({...prev, dose: firstDose}));
                                                      setEditDate(""); setEditTime("");
                                                    }
                                                  }
                                                }
                                              } else {
                                                setManualDates({});
                                              }
                                            }}
                                            className="w-full p-2 border rounded-lg bg-white outline-none font-bold text-blue-700"
                                          >
                                            {allDoseOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
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
                                            const isChecked = editForm.items?.includes(bt.name);
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
                                                  <input type="checkbox" className="w-4 h-4 accent-blue-600" disabled={isIncluded} checked={isIncluded || editForm.items?.includes(bt.name)} 
                                                     onChange={e => {
                                                        if(isIncluded) return;
                                                        const newItems = e.target.checked ? [...editForm.items, bt.name] : editForm.items.filter((i: string) => i !== bt.name);
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

                              {/* --- AI RECOMMENDATION BOX --- */}
                              {isSystemGenerated && isEditingAppt && aiRec && (
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
                                          setEditForm((prev: any) => ({...prev, doctor_ic: docObj ? docObj.ic_passport_number : ''}));
                                          setEditDate(aiRec.raw_date);
                                          setEditTime(aiRec.raw_time.substring(0,5));
                                      }} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg transition-colors text-sm shadow-sm">
                                          Use AI Recommendation
                                      </button>
                                  </div>
                              )}

                              {/* --- ASSIGNED DOCTOR --- */}
                              <div className="col-span-2">
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Assigned Doctor *</label>
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

                              {/* --- CUSTOM COLOR-CODED DATE PICKER --- */}
                              <div className="col-span-2">
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Select Date</label>
                                {!editForm.doctor_ic ? (
                                    <div className="text-sm text-slate-500 italic p-4 bg-slate-50 rounded-lg text-center border border-dashed">Please select a doctor first</div>
                                ) : isLoadingContext ? (
                                    <div className="text-sm text-slate-500 italic p-4 bg-slate-50 rounded-lg text-center border border-dashed">Loading available dates...</div>
                                ) : agentContext?.dates ? (
                                    <div>
                                        <div className="flex items-center gap-3 mb-3 flex-wrap text-xs">
                                            <div className="flex items-center gap-1"><div className="w-3.5 h-3.5 bg-green-400 rounded border border-green-600"></div><span>Low Load</span></div>
                                            <div className="flex items-center gap-1"><div className="w-3.5 h-3.5 bg-yellow-300 rounded border border-yellow-600"></div><span>Medium</span></div>
                                            <div className="flex items-center gap-1"><div className="w-3.5 h-3.5 bg-red-400 rounded border border-red-600"></div><span>Busy</span></div>
                                            <div className="flex items-center gap-1"><div className="w-3.5 h-3.5 bg-slate-300 rounded border border-slate-400"></div><span>Unavailable</span></div>
                                        </div>

                                        {isSystemGenerated && minEditDate > moment().format("YYYY-MM-DD") && (
                                            <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 font-semibold">
                                                <span>📅</span>
                                                <span>Earliest allowed date (interval requirement): <strong>{moment(minEditDate).format("D MMMM YYYY")}</strong></span>
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between mb-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                                            <button type="button" onClick={() => { const d = new Date(viewYear, viewMonth - 1, 1); setViewMonth(d.getMonth()); setViewYear(d.getFullYear()); }} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-base shadow-sm">‹</button>
                                            <div className="flex items-center gap-2">
                                                <select value={viewMonth} onChange={e => setViewMonth(parseInt(e.target.value))} className="p-1 border border-slate-200 rounded-lg text-sm outline-none bg-white font-semibold text-slate-700">
                                                    {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => <option key={i} value={i}>{m}</option>)}
                                                </select>
                                                <select value={viewYear} onChange={e => setViewYear(parseInt(e.target.value))} className="p-1 border border-slate-200 rounded-lg text-sm outline-none bg-white font-semibold text-slate-700">
                                                    {[new Date().getFullYear(), new Date().getFullYear() + 1, new Date().getFullYear() + 2].map(y => <option key={y} value={y}>{y}</option>)}
                                                </select>
                                            </div>
                                            <button type="button" onClick={() => { const d = new Date(viewYear, viewMonth + 1, 1); setViewMonth(d.getMonth()); setViewYear(d.getFullYear()); }} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-base shadow-sm">›</button>
                                        </div>

                                        <div className="grid grid-cols-7 gap-1 mb-1">
                                            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="text-center text-[10px] font-bold text-slate-400 py-0.5">{d}</div>)}
                                        </div>

                                        <div className="grid grid-cols-7 gap-1">
                                            {(() => {
                                                const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
                                                const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
                                                const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
                                                const dateMap = new Map<string, any>((agentContext.dates as any[]).map((d: any) => [d.date, d]));
                                                const cells: React.ReactElement[] = [];

                                                for (let i = 0; i < firstDayOfWeek; i++) cells.push(<div key={`empty-${i}`} className="min-h-[42px]" />);

                                                for (let day = 1; day <= daysInMonth; day++) {
                                                    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                                    const cellDate = new Date(viewYear, viewMonth, day);
                                                    const isPast = cellDate < todayDate;
                                                    const isBelowMin = cellDate < new Date(minEditDate + 'T00:00:00');
                                                    const dateInfo = dateMap.get(dateStr);
                                                    const isSelected = editDate === dateStr;

                                                    let bgColor = "bg-slate-100 text-slate-300"; let borderColor = "border-slate-200"; let hoverClass = "cursor-not-allowed"; let isDisabled = true;

                                                    if (!isPast && !isBelowMin) {
                                                        if (dateInfo && !dateInfo.disabled) {
                                                            isDisabled = false;
                                                            if (dateInfo.status === "Green") { bgColor = "bg-green-100 text-green-900"; borderColor = "border-green-300"; hoverClass = "hover:bg-green-200 cursor-pointer"; } 
                                                            else if (dateInfo.status === "Yellow") { bgColor = "bg-yellow-100 text-yellow-900"; borderColor = "border-yellow-300"; hoverClass = "hover:bg-yellow-200 cursor-pointer"; } 
                                                            else if (dateInfo.status === "Red") { bgColor = "bg-red-100 text-red-900"; borderColor = "border-red-300"; hoverClass = "hover:bg-red-200 cursor-pointer"; }
                                                        }
                                                    }
                                                    cells.push(
                                                        <button key={dateStr} type="button" disabled={isDisabled} onClick={() => { setEditDate(dateStr); setEditTime(""); }}
                                                            className={`min-h-[42px] rounded border transition-all text-xs font-semibold flex flex-col items-center justify-center ${isSelected ? "ring-2 ring-blue-500 ring-offset-1 shadow-md" : ""} ${bgColor} ${borderColor} ${hoverClass}`}>
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

                              {/* --- TIME SELECTION --- */}
                              {editDate && editForm.doctor_ic && (
                                  <div className="col-span-2">
                                      <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Select Time</label>
                                      {availableTimes.length > 0 ? (
                                          <div className="grid grid-cols-4 gap-2">
                                              {availableTimes.map((t: string, idx: number) => {
                                                  let stars = "";
                                                  if (aiRec) {
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
                              )}

                              {/* --- STATUS --- */}
                              <div>
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
                                                  if (e.target.value !== "Other") setInlineCancelReason(e.target.value);
                                                  else setInlineCancelReason("");
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
                                              <input type="text" value={inlineCancelReason} onChange={e => setInlineCancelReason(e.target.value)} className="w-full p-2 border rounded-lg bg-white outline-none border-red-300" placeholder="Please specify why this was canceled..." />
                                          )}
                                      </div>
                                  )}
                              </div>
                          </div>
                      ) : (
                          <div className="space-y-4">
                              {/* --- PATIENT NAME HEADER --- */}
                              <div className="border-b border-slate-200 pb-4">
                                  <div className="flex justify-between items-end mb-1">
                                      <label className="block text-xs font-bold text-slate-400 uppercase">Patient</label>
                                  </div>
                                  <div className="font-bold text-slate-800 text-lg uppercase">{selectedApptDetail.patient_name}</div>
                              </div>

                              <dl className="space-y-2.5 text-sm !mt-[3px]">
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
                          </div>
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
                                  setMinDate(moment().format("YYYY-MM-DD"));
                                  setManualDates({});
                                  setRestartSeries(false);

                                  const dNum = getDoseNum(selectedApptDetail.details?.dose || selectedApptDetail.stage_name || '');
                                  const sysGen = selectedApptDetail.service === 'Vaccine' && dNum >= 2;
                                  setIsSystemGenerated(sysGen);

                                  let calcMin = moment().format("YYYY-MM-DD");
                                  if (sysGen) {
                                      const seriesStages = selectedPatientAppts
                                        .filter((e: any) => e.appt_id === selectedApptDetail.appt_id && e.status !== 'canceled' && e.id !== selectedApptDetail.id)
                                        .sort((a: any, b: any) => getDoseNum(a.details?.dose || a.stage_name) - getDoseNum(b.details?.dose || b.stage_name));
                                      const prevNum = dNum === 9999
                                        ? Math.max(...seriesStages.filter((s: any) => getDoseNum(s.details?.dose || s.stage_name) < 9999).map((s: any) => getDoseNum(s.details?.dose || s.stage_name)), 0)
                                        : dNum - 1;
                                      const prevStage = seriesStages.find((s: any) => getDoseNum(s.details?.dose || s.stage_name) === prevNum);
                                      if (prevStage) {
                                          const vacName = selectedApptDetail.details?.items?.[0] || '';
                                          const vac = vaccinesList.find((v: any) => v.name === vacName);
                                          const targetNum = dNum === 9999 ? ((vac?.total_doses || 0) + 1) : dNum;
                                          const sched = vac?.schedules?.find((s: any) => s.dose_number === targetNum);
                                          if (sched?.interval_days) {
                                              calcMin = moment(prevStage.date).add(sched.interval_days, 'days').format("YYYY-MM-DD");
                                          }
                                      }
                                      if (calcMin > moment().format("YYYY-MM-DD")) {
                                          const m = moment(calcMin);
                                          setViewMonth(m.month());
                                          setViewYear(m.year());
                                      }
                                  }
                                  setMinEditDate(calcMin);
                                  minEditDateRef.current = calcMin;

                                  setEditForm({
                                      status: selectedApptDetail.status,
                                      doctor_ic: selectedApptDetail.doctor_ic || (doctors.length > 0 ? doctors[0].ic_passport_number : ''),
                                      service: selectedApptDetail.service,
                                      patient_ic: selectedApptDetail.patient_ic,
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