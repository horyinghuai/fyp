"use client";

import { useState, useEffect } from 'react';

const CLINIC_ID = "c1111111-1111-1111-1111-111111111111";

export default function PatientsPage() {
  const [patients, setPatients] = useState<any[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`http://localhost:8000/admin/patients/${CLINIC_ID}`)
      .then(res => {
          if(!res.ok) throw new Error("Failed to fetch");
          return res.json();
      })
      .then(data => {
          setPatients(data);
          setError(false);
      })
      .catch(err => {
          console.error(err);
          setError(true);
      });
  }, []);

  return (
    <div>
      <h2>👥 Patient Directory</h2>
      <p>View and manage registered patients.</p>
      
      {error && <div style={{ color: 'red', marginBottom: '10px' }}>Cannot connect to backend. Is FastAPI running?</div>}

      <table style={{ width: '100%', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', borderCollapse: 'collapse' }}>
        <thead style={{ backgroundColor: '#34495e', color: 'white', textAlign: 'left' }}>
          <tr>
            <th style={{ padding: '15px' }}>IC / Passport</th>
            <th style={{ padding: '15px' }}>Name</th>
            <th style={{ padding: '15px' }}>Gender</th>
            <th style={{ padding: '15px' }}>Phone</th>
            <th style={{ padding: '15px' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {patients.map(p => (
            <tr key={p.ic_passport_number} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '15px' }}>{p.ic_passport_number}</td>
              <td style={{ padding: '15px' }}>{p.name}</td>
              <td style={{ padding: '15px' }}>{p.gender}</td>
              <td style={{ padding: '15px' }}>{p.phone}</td>
              <td style={{ padding: '15px' }}><button style={{ padding: '5px 10px', cursor: 'pointer' }}>View History</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}