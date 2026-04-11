"use client";

import { useState, useEffect } from 'react';

const CLINIC_ID = "c1111111-1111-1111-1111-111111111111";

export default function VaccinesPage() {
  const [vaccines, setVaccines] = useState<any[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`http://localhost:8000/vaccines/${CLINIC_ID}`)
      .then(res => {
          if(!res.ok) throw new Error("Failed to fetch");
          return res.json();
      })
      .then(data => { setVaccines(data); setError(false); })
      .catch(err => { console.error(err); setError(true); });
  }, []);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ margin: '0 0 10px 0', color: '#1E293B', fontSize: '2rem' }}>💉 Vaccine Inventory & AI Logic</h1>
        <p style={{ margin: 0, color: '#64748B' }}>Configure vaccine parameters to allow the AI Agent to auto-schedule multi-stage appointments.</p>
      </div>
      
      {error && <div style={{ color: '#EF4444', marginBottom: '15px' }}>Cannot connect to backend. Is FastAPI running?</div>}

      <div style={{ backgroundColor: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
            <tr>
              <th style={{ padding: '16px 20px', color: '#475569', fontWeight: '600' }}>Vaccine Name</th>
              <th style={{ padding: '16px 20px', color: '#475569', fontWeight: '600', textAlign: 'center' }}>Total Doses</th>
              <th style={{ padding: '16px 20px', color: '#475569', fontWeight: '600' }}>Price</th>
              <th style={{ padding: '16px 20px', color: '#475569', fontWeight: '600', textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {vaccines.map((v, index) => (
              <tr key={v.id} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
                <td style={{ padding: '16px 20px' }}>
                  <div style={{ fontWeight: 'bold', color: '#1E293B', fontSize: '1.1rem', marginBottom: '4px' }}>{v.name}</div>
                  <span style={{ fontSize: '0.8rem', color: '#64748B' }}>Type: {v.type}</span>
                  {v.has_booster && (
                    <span style={{ marginLeft: '10px', fontSize: '0.75rem', backgroundColor: '#FEF3C7', color: '#D97706', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>⭐ Requires Booster</span>
                  )}
                </td>
                <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                  <div style={{ display: 'inline-block', backgroundColor: '#E0F2FE', color: '#2563EB', fontWeight: 'bold', padding: '8px 16px', borderRadius: '8px' }}>
                    {v.total_doses} Stage{v.total_doses > 1 ? 's' : ''}
                  </div>
                </td>
                <td style={{ padding: '16px 20px', color: '#10B981', fontWeight: 'bold', fontSize: '1.1rem' }}>RM {v.price}</td>
                <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                  <button style={{ padding: '8px 16px', backgroundColor: '#3B82F6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', transition: 'background 0.2s' }}>
                    Configure AI Logic
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}