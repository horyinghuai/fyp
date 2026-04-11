"use client";

import { useState, useEffect } from 'react';

const CLINIC_ID = "c1111111-1111-1111-1111-111111111111";

export default function BloodTestsPage() {
  const [packages, setPackages] = useState<any[]>([]);
  const [singles, setSingles] = useState<any[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchBloodTests = async () => {
      try {
        // Fetch both packages and single tests at the same time
        const [pkgRes, sglRes] = await Promise.all([
          fetch(`http://localhost:8000/blood-tests/${CLINIC_ID}/package`),
          fetch(`http://localhost:8000/blood-tests/${CLINIC_ID}/single`)
        ]);

        if (!pkgRes.ok || !sglRes.ok) throw new Error("Failed to fetch");

        const pkgData = await pkgRes.json();
        const sglData = await sglRes.json();

        setPackages(pkgData);
        setSingles(sglData);
        setError(false);
      } catch (err) {
        console.error(err);
        setError(true);
      }
    };

    fetchBloodTests();
  }, []);

  return (
    <div>
      <h2>🩸 Blood Test Management</h2>
      <p>View and manage blood test packages and individual tests available at the clinic.</p>
      
      {error && <div style={{ color: 'red', marginBottom: '10px' }}>Cannot connect to backend. Is FastAPI running?</div>}

      {/* PACKAGES TABLE */}
      <h3 style={{ marginTop: '30px', color: '#2c3e50' }}>Comprehensive Packages</h3>
      <table style={{ width: '100%', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', borderCollapse: 'collapse' }}>
        <thead style={{ backgroundColor: '#34495e', color: 'white', textAlign: 'left' }}>
          <tr>
            <th style={{ padding: '15px' }}>Package Name</th>
            <th style={{ padding: '15px' }}>Description</th>
            <th style={{ padding: '15px' }}>Included Tests</th>
            <th style={{ padding: '15px' }}>Price (RM)</th>
            <th style={{ padding: '15px' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {packages.map(p => (
            <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '15px', fontWeight: 'bold' }}>{p.name}</td>
              <td style={{ padding: '15px', color: '#7f8c8d' }}>{p.description}</td>
              <td style={{ padding: '15px', fontSize: '0.9em' }}>
                {p.included_tests && p.included_tests.length > 0 
                  ? p.included_tests.join(", ") 
                  : "None specified"}
              </td>
              <td style={{ padding: '15px', color: '#27ae60', fontWeight: 'bold' }}>{p.price}</td>
              <td style={{ padding: '15px' }}><button style={{ padding: '5px 10px', cursor: 'pointer' }}>Edit</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* SINGLE TESTS TABLE */}
      <h3 style={{ marginTop: '40px', color: '#2c3e50' }}>Individual Tests</h3>
      <table style={{ width: '100%', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', borderCollapse: 'collapse', marginBottom: '40px' }}>
        <thead style={{ backgroundColor: '#7f8c8d', color: 'white', textAlign: 'left' }}>
          <tr>
            <th style={{ padding: '15px' }}>Test Name</th>
            <th style={{ padding: '15px' }}>Description</th>
            <th style={{ padding: '15px' }}>Price (RM)</th>
            <th style={{ padding: '15px' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {singles.map(s => (
            <tr key={s.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '15px' }}>{s.name}</td>
              <td style={{ padding: '15px', color: '#7f8c8d' }}>{s.description}</td>
              <td style={{ padding: '15px', color: '#27ae60', fontWeight: 'bold' }}>{s.price}</td>
              <td style={{ padding: '15px' }}><button style={{ padding: '5px 10px', cursor: 'pointer' }}>Edit</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}