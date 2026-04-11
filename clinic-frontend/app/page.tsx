"use client";

import React, { useState, useEffect } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = momentLocalizer(moment);
const CLINIC_ID = "c1111111-1111-1111-1111-111111111111"; 

export default function AdminDashboard() {
  const [events, setEvents] = useState([]);
  const [backendError, setBackendError] = useState(false); // NEW: Error handling state

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    try {
      const response = await fetch(`http://localhost:8000/admin/appointments/${CLINIC_ID}`);
      
      if (!response.ok) throw new Error("Backend responded with an error");
      
      const data = await response.json();
      const formattedEvents = data.map(appt => ({
        id: appt.id,
        title: appt.title,
        start: new Date(appt.start),
        end: new Date(appt.end),
        color: appt.color,
        doctor: appt.doctor,
        type: appt.type
      }));
      
      setEvents(formattedEvents);
      setBackendError(false);
    } catch (error) {
      console.error("Error fetching appointments:", error);
      setBackendError(true); // Triggers the warning UI
    }
  };

  const eventStyleGetter = (event) => ({
    style: { backgroundColor: event.color, borderRadius: '5px', color: 'white', border: '0px' }
  });

  return (
    <div>
      <h2>Dashboard Overview</h2>
      
      {/* WARNING IF PYTHON BACKEND IS OFF */}
      {backendError && (
        <div style={{ backgroundColor: '#ffcccc', color: '#c0392b', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
          <strong>⚠️ Warning: Cannot connect to Backend Database.</strong><br/>
          Please ensure your Python FastAPI server is running on <code>http://localhost:8000</code> and CORS is enabled in main.py.
        </div>
      )}

      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
        <span style={{color: '#3788d8'}}>🟦 Single Visit</span>
        <span style={{color: '#fd7e14'}}>🟧 Follow-up</span>
        <span style={{color: '#28a745'}}>🟩 Multi-stage / Vaccine</span>
      </div>

      <div style={{ height: '70vh', backgroundColor: 'white', padding: '15px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
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