import React, { useState, useEffect } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = momentLocalizer(moment);
const CLINIC_ID = "c1111111-1111-1111-1111-111111111111"; // Replace with context/auth

export default function AdminDashboard() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    try {
      const response = await fetch(`http://localhost:8000/admin/appointments/${CLINIC_ID}`);
      const data = await response.json();
      
      // Parse dates for the Calendar component
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
    } catch (error) {
      console.error("Error fetching appointments:", error);
    }
  };

  // Apply the specific colors from the backend
  const eventStyleGetter = (event) => {
    return {
      style: {
        backgroundColor: event.color,
        borderRadius: '5px',
        opacity: 0.8,
        color: 'white',
        border: '0px',
        display: 'block'
      }
    };
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h2>🏥 Clinic Admin Dashboard</h2>
      
      {/* Legend */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
        <span style={{color: '#3788d8'}}>🟦 Single Visit</span>
        <span style={{color: '#fd7e14'}}>🟧 Follow-up</span>
        <span style={{color: '#28a745'}}>🟩 Multi-stage / Vaccine</span>
      </div>

      <div style={{ height: '70vh' }}>
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%' }}
          eventPropGetter={eventStyleGetter}
          views={['month', 'week', 'day']}
          defaultView="week"
          onSelectEvent={event => alert(`Details:\nPatient: ${event.title}\nDoctor: ${event.doctor}`)}
        />
      </div>
    </div>
  );
}