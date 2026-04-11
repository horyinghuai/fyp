"use client";

import { useState, useEffect } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { X, User, Clock, Activity, Calendar as CalIcon } from 'lucide-react';

const localizer = momentLocalizer(moment);
const CLINIC_ID = "c1111111-1111-1111-1111-111111111111"; 

export default function AdminDashboard() {
  const [events, setEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [stats, setStats] = useState({ total: 0, vaccines: 0, followUp: 0 });
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;
    fetch(`http://127.0.0.1:8000/admin/appointments/${CLINIC_ID}`)
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(data => {
        if (!isMounted) return;
        let vacCount = 0, folCount = 0;
        const formattedEvents = data.map((appt: any) => {
          if (appt.type === "multi-stage") vacCount++;
          if (appt.type === "follow-up") folCount++;
          return { ...appt, start: new Date(appt.start), end: new Date(appt.end) };
        });
        setEvents(formattedEvents);
        setStats({ total: formattedEvents.length, vaccines: vacCount, followUp: folCount });
        setIsLoading(false);
      })
      .catch(() => { if (isMounted) { setError(true); setIsLoading(false); } });
      
    return () => { isMounted = false; };
  }, []);

  const eventStyleGetter = (event: any) => ({
    style: { backgroundColor: event.color, borderRadius: '6px', border: 'none', padding: '4px', opacity: 0.9, fontSize: '0.8rem', fontWeight: 600 }
  });

  if (isLoading) return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 bg-slate-200 rounded w-1/4"></div>
      <div className="grid grid-cols-3 gap-6"><div className="h-32 bg-slate-200 rounded-2xl"></div><div className="h-32 bg-slate-200 rounded-2xl"></div><div className="h-32 bg-slate-200 rounded-2xl"></div></div>
      <div className="h-[60vh] bg-slate-200 rounded-2xl"></div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto relative">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800">Dashboard Overview</h1>
        <p className="text-slate-500 mt-1">Manage today's schedule and monitor clinic load.</p>
      </div>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-xl mb-6 shadow-sm">
          <strong>⚠️ Connection Error:</strong> Cannot connect to the database. Is FastAPI running on 127.0.0.1:8000?
        </div>
      )}

      {/* METRICS CARDS */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4"><div className="p-3 bg-blue-100 text-blue-600 rounded-xl"><User size={24}/></div>
          <div><p className="text-sm font-bold text-slate-400 uppercase">Total Appointments</p><h3 className="text-3xl font-black text-slate-800">{stats.total}</h3></div></div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4"><div className="p-3 bg-purple-100 text-purple-600 rounded-xl"><Activity size={24}/></div>
          <div><p className="text-sm font-bold text-slate-400 uppercase">Vaccine Stages</p><h3 className="text-3xl font-black text-slate-800">{stats.vaccines}</h3></div></div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4"><div className="p-3 bg-orange-100 text-orange-600 rounded-xl"><Clock size={24}/></div>
          <div><p className="text-sm font-bold text-slate-400 uppercase">Follow-ups Pending</p><h3 className="text-3xl font-black text-slate-800">{stats.followUp}</h3></div></div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-[65vh]">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          eventPropGetter={eventStyleGetter}
          views={['month', 'week', 'day']}
          defaultView="week"
          onSelectEvent={(event) => setSelectedEvent(event)}
        />
      </div>

      {selectedEvent && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-[450px] overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><CalIcon size={18}/> Appointment Details</h3>
              <button onClick={() => setSelectedEvent(null)} className="text-slate-400 hover:text-red-500"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4">
              <div><p className="text-xs text-slate-400 font-bold uppercase">Patient Name</p><p className="font-semibold text-lg">{selectedEvent.title.split(' - ')[0]}</p></div>
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-slate-400 font-bold uppercase">Type</p><span className="mt-1 inline-block px-3 py-1 bg-slate-100 rounded-full text-xs font-bold text-slate-600">{selectedEvent.type}</span></div>
                <div><p className="text-xs text-slate-400 font-bold uppercase">Doctor</p><p className="font-medium">{selectedEvent.doctor}</p></div>
              </div>
              <div><p className="text-xs text-slate-400 font-bold uppercase">Schedule</p><p className="font-medium">{moment(selectedEvent.start).format("dddd, MMMM Do YYYY, h:mm a")}</p></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}