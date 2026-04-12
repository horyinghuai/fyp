"use client";

import { useState, useEffect } from 'react';

const CLINIC_ID = "c1111111-1111-1111-1111-111111111111";

export default function BotRepliesPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`http://127.0.0.1:8000/admin/chat-history/${CLINIC_ID}`)
      .then(res => res.json())
      .then(data => { setHistory(data); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, []);

  if (isLoading) return <div className="animate-pulse h-64 bg-slate-200 rounded-2xl"></div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800">🤖 Telegram Bot History</h1>
        <p className="text-slate-500 mt-1">Review inquiries and automated responses processed by your clinic assistant.</p>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="p-4 font-semibold text-slate-600 w-1/4">Timestamp</th>
              <th className="p-4 font-semibold text-slate-600 w-1/4">Patient Telegram ID</th>
              <th className="p-4 font-semibold text-slate-600">Interaction Log</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr><td colSpan={3} className="p-8 text-center text-slate-400">No chat history available.</td></tr>
            ) : (
              history.map((msg, idx) => (
                <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50 transition">
                  <td className="p-4 align-top text-sm font-medium text-slate-500 whitespace-nowrap">
                    {new Date(msg.created_at).toLocaleString()}
                  </td>
                  <td className="p-4 align-top font-mono text-sm text-blue-600">
                    {msg.telegram_id || 'System Generated'}
                  </td>
                  <td className="p-4 space-y-3">
                    {msg.message && (
                       <div className="bg-slate-100 p-3 rounded-lg rounded-tl-none inline-block max-w-full">
                         <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">User Query</span>
                         <span className="text-sm text-slate-800">{msg.message}</span>
                       </div>
                    )}
                    {msg.reply && (
                       <div className="flex flex-col items-end">
                         <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg rounded-tr-none inline-block max-w-full text-right">
                           <span className="block text-[10px] font-bold text-blue-400 uppercase mb-1">Bot Response</span>
                           <span className="text-sm text-slate-800">{msg.reply}</span>
                         </div>
                       </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}