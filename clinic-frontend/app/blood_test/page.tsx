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
        const [pkgRes, sglRes] = await Promise.all([
          fetch(`http://localhost:8000/blood-tests/${CLINIC_ID}/package`),
          fetch(`http://localhost:8000/blood-tests/${CLINIC_ID}/single`)
        ]);

        if (!pkgRes.ok || !sglRes.ok) throw new Error("Failed to fetch");

        setPackages(await pkgRes.json());
        setSingles(await sglRes.json());
        setError(false);
      } catch (err) {
        console.error(err);
        setError(true);
      }
    };
    fetchBloodTests();
  }, []);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ margin: '0 0 10px 0', color: '#1E293B', fontSize: '2rem' }}>🩸 Blood Test Services</h1>
        <p style={{ margin: 0, color: '#64748B' }}>Manage full diagnostic packages and standalone test pricing.</p>
      </div>
      
      {error && <div style={{ color: '#EF4444', marginBottom: '15px' }}>Cannot connect to backend. Is FastAPI running?</div>}

      {/* PACKAGES AS GRID CARDS */}
      <h2 style={{ color: '#1E293B', borderBottom: '2px solid #E2E8F0', paddingBottom: '10px', marginBottom: '20px' }}>Comprehensive Packages</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px', marginBottom: '50px' }}>
        {packages.map(p => (
          <div key={p.id} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '25px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', borderTop: '4px solid #8B5CF6', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, color: '#1E293B', fontSize: '1.2rem', paddingRight: '15px' }}>{p.name}</h3>
              <span style={{ backgroundColor: '#F0FDF4', color: '#047857', padding: '5px 10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.1rem' }}>RM{p.price}</span>
            </div>
            <p style={{ color: '#64748B', fontSize: '0.9rem', marginBottom: '20px', fontStyle: 'italic' }}>{p.description}</p>
            
            <div style={{ marginTop: 'auto' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#94A3B8', textTransform: 'uppercase' }}>Included Tests:</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {p.included_tests?.slice(0, 5).map((test: string, i: number) => (
                  <span key={i} style={{ backgroundColor: '#F1F5F9', color: '#475569', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px' }}>{test}</span>
                ))}
                {p.included_tests?.length > 5 && <span style={{ backgroundColor: '#E2E8F0', color: '#475569', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px' }}>+{p.included_tests.length - 5} more</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* SINGLE TESTS AS A CLEAN TABLE */}
      <h2 style={{ color: '#1E293B', borderBottom: '2px solid #E2E8F0', paddingBottom: '10px', marginBottom: '20px' }}>Standalone Tests</h2>
      <div style={{ backgroundColor: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
            <tr>
              <th style={{ padding: '16px 20px', color: '#475569', fontWeight: '600' }}>Test Name</th>
              <th style={{ padding: '16px 20px', color: '#475569', fontWeight: '600' }}>Description</th>
              <th style={{ padding: '16px 20px', color: '#475569', fontWeight: '600' }}>Price</th>
            </tr>
          </thead>
          <tbody>
            {singles.map((s, index) => (
              <tr key={s.id} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
                <td style={{ padding: '16px 20px', fontWeight: '600', color: '#334155' }}>{s.name}</td>
                <td style={{ padding: '16px 20px', color: '#64748B', fontSize: '0.9rem' }}>{s.description}</td>
                <td style={{ padding: '16px 20px', color: '#10B981', fontWeight: 'bold' }}>RM {s.price}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}