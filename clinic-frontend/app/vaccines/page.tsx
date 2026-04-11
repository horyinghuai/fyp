"use client";

import { useState, useEffect } from 'react';
import { Syringe } from 'lucide-react';

const CLINIC_ID = "c1111111-1111-1111-1111-111111111111";

export default function VaccinesPage() {
  const [vaccines, setVaccines] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    fetch(`http://127.0.0.1:8000/vaccines/${CLINIC_ID}`)
      .then(res => res.json())
      .then(data => { if(isMounted) { setVaccines(data); setIsLoading(false); } })
      .catch(() => { if(isMounted) setIsLoading(false); });
    return () => { isMounted = false; };
  }, []);

  const DoseTimeline = ({ total }: { total: number }) => (
    <div className="flex items-center mt-4">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className="w-6 h-6 rounded-full bg-purple-100 border-2 border-purple-500 flex items-center justify-center text-[10px] font-bold text-purple-700">
              {i + 1}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 font-medium">Dose {i + 1}</span>
          </div>
          {i < total - 1 && <div className="w-12 h-0.5 bg-slate-200 mx-1 -mt-4"></div>}
        </div>
      ))}
    </div>
  );

  if (isLoading) return <div className="animate-pulse h-64 bg-slate-200 rounded-2xl"></div>;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800">Vaccine Inventory & AI Rules</h1>
        <p className="text-slate-500 mt-1">Configure parameters for the AI Agent to automate multi-stage scheduling.</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {vaccines.map((v) => (
          <div key={v.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow group relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>
            
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Syringe size={20} className="text-purple-500"/> {v.name}</h3>
                <span className="inline-block mt-2 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-semibold">{v.type}</span>
                {v.has_booster && <span className="inline-block mt-2 ml-2 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">⭐ Booster Stage</span>}
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-emerald-500">RM {v.price}</span>
              </div>
            </div>

            {/* VISUAL TIMELINE */}
            <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">AI Scheduling Sequence</p>
              <DoseTimeline total={v.total_doses} />
            </div>

            <div className="mt-6 flex justify-end">
              <button className="px-5 py-2.5 bg-white border-2 border-purple-100 text-purple-600 rounded-xl font-semibold hover:bg-purple-50 transition">
                Configure AI Logic
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}