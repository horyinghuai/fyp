"use client";
import React, { useState, useEffect } from 'react';

const CLINIC_ID = "c1111111-1111-1111-1111-111111111111";

export default function VaccinesPage() {
  const [vaccines, setVaccines] = useState([]);

  useEffect(() => {
    fetch(`http://localhost:8000/vaccines/${CLINIC_ID}`)
      .then(res => res.json())
      .then(data => setVaccines(data))
      .catch(err => console.error(err));
  }, []);

  return (
    <div>
      <h2>💉 Vaccine Management</h2>
      <p>Add, edit, or configure the AI multi-stage intervals for vaccines here.</p>

      <table style={{ width: '100%', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', borderCollapse: 'collapse' }}>
        <thead style={{ backgroundColor: '#34495e', color: 'white', textAlign: 'left' }}>
          <tr>
            <th style={{ padding: '15px' }}>Vaccine Name</th>
            <th style={{ padding: '15px' }}>Type</th>
            <th style={{ padding: '15px' }}>Total Doses</th>
            <th style={{ padding: '15px' }}>Price (RM)</th>
            <th style={{ padding: '15px' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {vaccines.map(v => (
            <tr key={v.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '15px' }}>{v.name} {v.has_booster ? '⭐' : ''}</td>
              <td style={{ padding: '15px' }}>{v.type}</td>
              <td style={{ padding: '15px' }}>{v.total_doses}</td>
              <td style={{ padding: '15px' }}>{v.price}</td>
              <td style={{ padding: '15px' }}><button style={{ padding: '5px 10px', cursor: 'pointer' }}>Edit Setup</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}