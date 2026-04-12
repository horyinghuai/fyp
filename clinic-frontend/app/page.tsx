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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [stats, setStats] = useState({ total: 0, vaccines: 0, bloodTests: 0 });
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [isEditingEvent, setIsEditingEvent] = useState(false);
  const [editEventForm, setEditEventForm] = useState({ status: '', scheduled_time: '' });

  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => { loadAppointments(); }, []);

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
          // FIX: Explicitly enforce valid JS Date object parsing for calendar
          return { ...appt, start: new Date(appt.start), end: new Date(appt.end), title: appt.title || "Unknown Patient" };
        });
        
        setEvents(formattedEvents);
        setStats({ total: formattedEvents.length, vaccines: vacCount, bloodTests: btCount });
        
        const sorted = [...formattedEvents].sort((a,b) => a.start.getTime() - b.start.getTime());
        if (sorted.length > 0) setCurrentDate(sorted[0].start);

        setIsLoading(false);
      })
      .catch(() => { setError(true); setIsLoading(false); });
  };

  const handleUpdateEvent = async () => {
    await fetch(`http://127.0.0.1:8000/admin/appointment-stages/${selectedEvent.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editEventForm)
    });
    setSelectedEvent(null);
    setIsEditingEvent(false);
    window.location.reload(); 
  };

  const openEventModal = (event: any) => {
    setSelectedEvent(event);
    setEditEventForm({
      status: event.status || 'scheduled',
      scheduled_time: moment(event.start).format("YYYY-MM-DDTHH:mm")
    });
    setIsEditingEvent(false);
  };

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
        <div className="bg-slate-900 text-white px-6 py-2 rounded-xl font-bold tracking-widest text-lg shadow-lg">
            YEAR: {currentDate.getFullYear()}
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
          eventPropGetter={eventStyleGetter}
          views={['month', 'week', 'day']}
          defaultView="week"
          onSelectEvent={openEventModal}
        />
      </div>

      {selectedEvent && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-[450px] overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><CalIcon size={18}/> Booking Details</h3>
              <button onClick={() => setSelectedEvent(null)} className="text-slate-400 hover:text-red-500"><X size={20}/></button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Patient Name</label>
                <p className="font-semibold text-lg">{selectedEvent?.title ? selectedEvent.title.split(' - ')[0] : 'Unknown Patient'}</p>
              </div>
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

              {isEditingEvent ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Schedule Date & Time</label>
                    <input type="datetime-local" value={editEventForm.scheduled_time} onChange={(e) => setEditEventForm({...editEventForm, scheduled_time: e.target.value})} className="w-full p-2 border rounded-lg outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Booking Status</label>
                    <select value={editEventForm.status} onChange={(e) => setEditEventForm({...editEventForm, status: e.target.value})} className="w-full p-2 border rounded-lg bg-white outline-none">
                      <option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="canceled">Canceled</option>
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Schedule Date & Time</label>
                    <p className="font-medium">{selectedEvent?.start ? moment(selectedEvent.start).format("dddd, MMMM Do YYYY, h:mm a") : ''}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Status</label>
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${selectedEvent.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : selectedEvent.status === 'canceled' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{selectedEvent.status}</span>
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 flex justify-end gap-3 border-t border-slate-100">
              {isEditingEvent ? (
                <>
                  <button onClick={() => setIsEditingEvent(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-medium">Cancel</button>
                  <button onClick={handleUpdateEvent} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium">Save Changes</button>
                </>
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