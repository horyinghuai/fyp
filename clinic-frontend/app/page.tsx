"use client";

import { useState, useEffect } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = momentLocalizer(moment);
const CLINIC_ID = "c1111111-1111-1111-1111-111111111111"; 

export default function AdminDashboard() {
  const [events, setEvents] = useState<any[]>([]);
  const [backendError, setBackendError] = useState(false);
  const [stats, setStats] = useState({ total: 0, vaccines: 0, followUp: 0 });

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    try {
      const response = await fetch(`http://localhost:8000/admin/appointments/${CLINIC_ID}`);
      if (!response.ok) throw new Error("Backend responded with an error");
      
      const data = await response.json();
      
      let vacCount = 0;
      let folCount = 0;

      const formattedEvents = data.map((appt: any) => {
        if (appt.type === "multi-stage") vacCount++;
        if (appt.type === "follow-up") folCount++;

        return {
          id: appt.id,
          title: appt.title,
          start: new Date(appt.start),
          end: new Date(appt.end),
          color: appt.color,
          doctor: appt.doctor,
          type: appt.type
        };
      });
      
      setEvents(formattedEvents);
      setStats({ total: formattedEvents.length, vaccines: vacCount, followUp: folCount });
      setBackendError(false);
    } catch (error) {
      console.error("Error fetching appointments:", error);
      setBackendError(true);
    }
  };

  const eventStyleGetter = (event: any) => ({
    style: { backgroundColor: event.color, borderRadius: '6px', color: 'white', border: 'none', padding: '2px 5px', fontSize: '0.85rem' }
  });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ margin: '0 0 10px 0', color: '#1E293B', fontSize: '2rem' }}>Dashboard Overview</h1>
        <p style={{ margin: 0, color: '#64748B' }}>Manage your clinic's daily appointments and resources.</p>
      </div>
      
      {backendError && (
        <div style={{ backgroundColor: '#FEE2E2', color: '#B91C1C', padding: '15px 20px', borderRadius: '8px', marginBottom: '25px', borderLeft: '4px solid #EF4444' }}>
          <strong>⚠️ Connection Error:</strong> Cannot connect to the database. Ensure FastAPI is running on port 8000.
        </div>
      )}

      {/* METRIC CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '30px' }}>
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderTop: '4px solid #3B82F6' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#64748B', fontSize: '0.9rem', textTransform: 'uppercase' }}>Total Appointments</h3>
          <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: 'bold', color: '#1E293B' }}>{stats.total}</p>
        </div>
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderTop: '4px solid #10B981' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#64748B', fontSize: '0.9rem', textTransform: 'uppercase' }}>Vaccine Stages</h3>
          <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: 'bold', color: '#1E293B' }}>{stats.vaccines}</p>
        </div>
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderTop: '4px solid #F59E0B' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#64748B', fontSize: '0.9rem', textTransform: 'uppercase' }}>Follow-ups</h3>
          <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: 'bold', color: '#1E293B' }}>{stats.followUp}</p>
        </div>
      </div>

      <div style={{ height: '65vh', backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          eventPropGetter={eventStyleGetter}
          views={['month', 'week', 'day']}
          defaultView="week"
        />
      </div>
    </div>
  );
}