"use client";

import { useState, useEffect } from 'react';

const CLINIC_ID = "c1111111-1111-1111-1111-111111111111";

export default function PatientsPage() {
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`http://localhost:8000/admin/patients/${CLINIC_ID}`)
      .then(res => {
          if(!res.ok) throw new Error("Failed to fetch");
          return res.json();
      })
      .then(data => { setPatients(data); setError(false); })
      .catch(err => { console.error(err); setError(true); });
  }, []);

  // Interactive Live Filter
  const filteredPatients = patients.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.ic_passport_number.includes(search)
  );

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h1 style={{ margin: '0 0 10px 0', color: '#1E293B', fontSize: '2rem' }}>👥 Patient Directory</h1>
          <p style={{ margin: 0, color: '#64748B' }}>View and search through registered clinic patients.</p>
        </div>
        
        {/* Search Bar */}
        <input 
          type="text" 
          placeholder="Search by Name or IC..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '12px 20px', width: '300px', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none', fontSize: '1rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
        />
      </div>
      
      {error && <div style={{ color: '#EF4444', marginBottom: '15px' }}>Cannot connect to backend. Is FastAPI running?</div>}

      <div style={{ backgroundColor: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
            <tr>
              <th style={{ padding: '16px 20px', color: '#475569', fontWeight: '600' }}>Patient Details</th>
              <th style={{ padding: '16px 20px', color: '#475569', fontWeight: '600' }}>IC / Passport</th>
              <th style={{ padding: '16px 20px', color: '#475569', fontWeight: '600' }}>Contact</th>
              <th style={{ padding: '16px 20px', color: '#475569', fontWeight: '600', textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredPatients.length > 0 ? filteredPatients.map((p, index) => (
              <tr key={p.ic_passport_number} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
                <td style={{ padding: '16px 20px' }}>
                  <div style={{ fontWeight: 'bold', color: '#1E293B', marginBottom: '4px' }}>{p.name}</div>
                  <span style={{ fontSize: '0.75rem', backgroundColor: '#E0E7FF', color: '#3B82F6', padding: '3px 8px', borderRadius: '12px' }}>{p.gender}</span>
                  <span style={{ fontSize: '0.75rem', color: '#64748B', marginLeft: '10px' }}>{p.nationality}</span>
                </td>
                <td style={{ padding: '16px 20px', color: '#475569', fontFamily: 'monospace' }}>{p.ic_passport_number}</td>
                <td style={{ padding: '16px 20px', color: '#475569' }}>{p.phone}</td>
                <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                  <button style={{ padding: '8px 16px', backgroundColor: '#F1F5F9', color: '#3B82F6', border: '1px solid #CBD5E1', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s' }}>
                    View Profile
                  </button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={4} style={{ padding: '30px', textAlign: 'center', color: '#94A3B8' }}>No patients found matching "{search}"</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}