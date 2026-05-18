"use client";

import { useState, useEffect, useMemo } from 'react';
import { MessageSquare, Send, Search, PlusCircle, X, Smartphone, Edit, Trash2 } from 'lucide-react';

export default function BotRepliesPage() {
  const [clinicId, setClinicId] = useState<string>('');
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [groupedChats, setGroupedChats] = useState<Record<string, any[]>>({});
  const [selectedChatKey, setSelectedChatKey] = useState<string | null>(null);
  
  const [threadReplyText, setThreadReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState("");
  const [newChatMessage, setNewChatMessage] = useState("");

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, msgId: number, text: string } | null>(null);
  const [editModal, setEditModal] = useState<{ isOpen: boolean, msgId: number, text: string } | null>(null);

  useEffect(() => { 
      const userStr = localStorage.getItem('aicas_user');
      if (userStr) {
          const user = JSON.parse(userStr);
          setClinicId(user.clinic_id);
          fetchHistory(user.clinic_id);
      }
  }, []);

  const fetchHistory = (cid: string = clinicId) => {
    if (!cid) return;
    const token = localStorage.getItem('aicas_token');
    fetch(`http://127.0.0.1:8000/admin/chat-history/${cid}`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        setHistory(data);
        const grouped = data.reduce((acc: any, curr: any) => {
            const key = curr.telegram_id ? `TG-${curr.telegram_id}` : (curr.phone ? `SMS-${curr.phone}` : "System");
            if (!acc[key]) acc[key] = [];
            acc[key].push(curr);
            return acc;
        }, {});
        setGroupedChats(grouped);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  };

  useEffect(() => {
    const interval = setInterval(() => fetchHistory(clinicId), 10000); 
    return () => clearInterval(interval);
  }, [clinicId]);

  // Close context menu on click outside
  useEffect(() => {
      const handleClick = () => setContextMenu(null);
      window.addEventListener('click', handleClick);
      return () => window.removeEventListener('click', handleClick);
  }, []);

  const markAsRead = async (chatKey: string) => {
      setSelectedChatKey(chatKey);
      setContextMenu(null);
      const token = localStorage.getItem('aicas_token');
      try {
          await fetch(`http://127.0.0.1:8000/admin/chat-read`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ chat_key: chatKey, clinic_id: clinicId })
          });
          fetchHistory(clinicId);
      } catch (e) {}
  };

  const handleSendToThread = async () => {
    if (!threadReplyText.trim() || !selectedChatKey) return;
    setSending(true);
    
    const payload: any = { clinic_id: clinicId, reply_text: threadReplyText };
    if (selectedChatKey.startsWith("TG-")) payload.telegram_id = parseInt(selectedChatKey.replace("TG-", ""));
    if (selectedChatKey.startsWith("SMS-")) payload.phone = selectedChatKey.replace("SMS-", "");

    const token = localStorage.getItem('aicas_token');
    try {
        const res = await fetch(`http://127.0.0.1:8000/admin/chat-reply`, {
            method: "POST", headers: { "Content-Type": "application/json", 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload)
        });
        if(res.ok) { setThreadReplyText(""); fetchHistory(clinicId); } 
        else alert("Failed to send message.");
    } catch (e) { alert("Server error."); }
    setSending(false);
  };

  const handleStartNewChat = async () => {
    const phone = newChatPhone.trim();
    if (!phone.startsWith('+')) {
        alert("Phone number must start with a '+' symbol.");
        return;
    }
    if (phone.startsWith('+60')) {
        const myRegex = /^\+60(\d{2}-\d{7,8}|\d{9,10})$/;
        if (!myRegex.test(phone)) {
            alert("Invalid Malaysian Phone Format. Valid formats:\n+60XX-XXXXXXXX\n+60XXXXXXXXXX\n+60XXXXXXXXX\n+60XX-XXXXXXX");
            return;
        }
    }
    if (!newChatMessage.trim()) return alert("Message is required.");

    if (!window.confirm(`Are you sure you want to send a new SMS to ${newChatPhone}?`)) return;

    setSending(true);
    const token = localStorage.getItem('aicas_token');
    try {
        const res = await fetch(`http://127.0.0.1:8000/admin/chat-reply`, {
            method: "POST", headers: { "Content-Type": "application/json", 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ phone: newChatPhone, clinic_id: clinicId, reply_text: newChatMessage })
        });
        if(res.ok) {
            setNewChatPhone(""); setNewChatMessage(""); setShowNewChatModal(false);
            fetchHistory(clinicId); setSelectedChatKey(`SMS-${newChatPhone}`);
        } else alert("Failed to send message.");
    } catch (e) { alert("Server error."); }
    setSending(false);
  };

  const handleEditSubmit = async () => {
      if (!editModal) return;
      const token = localStorage.getItem('aicas_token');
      try {
          await fetch(`http://127.0.0.1:8000/admin/chat-reply/${editModal.msgId}`, {
              method: "PUT", headers: { "Content-Type": "application/json", 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ new_text: editModal.text })
          });
          setEditModal(null);
          fetchHistory(clinicId);
      } catch (e) { alert("Failed to edit"); }
  };

  const handleDeleteMsg = async (msgId: number) => {
      if (!window.confirm("Are you sure you want to delete this message?")) return;
      const token = localStorage.getItem('aicas_token');
      try {
          await fetch(`http://127.0.0.1:8000/admin/chat-reply/${msgId}`, { method: "DELETE", headers: { 'Authorization': `Bearer ${token}` } });
          fetchHistory(clinicId);
      } catch (e) { alert("Failed to delete"); }
  };

  const filteredChats = useMemo(() => {
      const lowerSearch = searchTerm.toLowerCase();
      return Object.keys(groupedChats).filter(key => {
          if (key.toLowerCase().includes(lowerSearch)) return true;
          return (groupedChats[key] || []).some(msg => 
              (msg.message && msg.message.toLowerCase().includes(lowerSearch)) || 
              (msg.reply && msg.reply.toLowerCase().includes(lowerSearch))
          );
      }).sort((a, b) => {
          const aHasUnread = (groupedChats[a] || []).some(m => m.status === 'unread');
          const bHasUnread = (groupedChats[b] || []).some(m => m.status === 'unread');
          if (aHasUnread && !bHasUnread) return -1;
          if (!aHasUnread && bHasUnread) return 1;
          return 0;
      });
  }, [groupedChats, searchTerm]);

  if (isLoading) return <div className="animate-pulse h-[60vh] bg-slate-200 rounded-2xl"></div>;

  return (
    <div className="max-w-7xl mx-auto h-[85vh] flex flex-col">
      <div className="mb-6 flex items-center justify-between">
        <div>
            <h1 className="text-3xl font-bold text-slate-800">🤖 Unified Chat & Bot Replies</h1>
            <p className="text-slate-500 mt-1">Right-click your replies to Edit or Delete. Clicking a chat marks it as read.</p>
        </div>
        <button onClick={() => setShowNewChatModal(true)} className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md flex items-center gap-2">
            <PlusCircle size={18} /> New SMS Chat
        </button>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
         {/* Sidebar */}
         <div className="w-1/3 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
             <div className="p-4 border-b bg-slate-50">
                 <input type="text" placeholder="Search chats..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full px-3 py-2 border rounded-lg outline-none text-sm" />
             </div>
             <div className="flex-1 overflow-y-auto">
                 {filteredChats.map(key => {
                     const msgs = groupedChats[key] || [];
                     const hasUnread = msgs.some(m => m.status === 'unread');
                     const latestMsg = msgs.length > 0 ? msgs[msgs.length - 1] : {};
                     const isSms = key.startsWith("SMS-");
                     const displayName = key.replace("TG-", "Telegram: ").replace("SMS-", "Phone: ");
                     
                     return (
                         <button key={key} onClick={() => markAsRead(key)} className={`w-full text-left p-4 border-b transition-colors flex items-start gap-3 ${selectedChatKey === key ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                             <div className={`p-2 rounded-full mt-1 ${hasUnread ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                                 {isSms ? <Smartphone size={18} /> : <MessageSquare size={18} />}
                             </div>
                             <div className="flex-1 min-w-0">
                                 <div className="flex justify-between">
                                     <span className="font-bold text-slate-800 truncate">{displayName}</span>
                                     {hasUnread && <span className="bg-red-500 w-2 h-2 rounded-full mt-1"></span>}
                                 </div>
                                 <span className="text-xs text-slate-500 truncate block">{latestMsg.reply || latestMsg.message || "No text"}</span>
                             </div>
                         </button>
                     )
                 })}
             </div>
         </div>

         {/* Chat Area */}
         <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col relative overflow-hidden">
             {selectedChatKey ? (
                 <>
                     <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
                         {(groupedChats[selectedChatKey] || []).map(msg => (
                             <div key={msg.id} className="space-y-4">
                                 {msg.message && msg.message !== "[Admin Initiated Chat]" && (
                                    <div className="flex justify-start">
                                        <div className="bg-white border p-3 rounded-2xl rounded-tl-sm max-w-[80%] shadow-sm whitespace-pre-wrap text-sm text-slate-700">
                                            {msg.message}
                                        </div>
                                    </div>
                                 )}
                                 {msg.reply && (
                                    <div className="flex justify-end">
                                        <div 
                                            onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.pageX, y: e.pageY, msgId: msg.id, text: msg.reply }); }}
                                            className="bg-blue-50 border border-blue-100 p-3 rounded-2xl rounded-tr-sm max-w-[80%] shadow-sm whitespace-pre-wrap text-sm text-slate-800 cursor-context-menu"
                                            title="Right-click to Edit or Delete"
                                        >
                                            {msg.reply}
                                        </div>
                                    </div>
                                 )}
                             </div>
                         ))}
                     </div>
                     <div className="p-4 border-t bg-white flex gap-2">
                         <input type="text" placeholder="Type reply..." value={threadReplyText} onChange={e => setThreadReplyText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendToThread()} className="flex-1 bg-slate-50 border px-4 py-3 rounded-xl outline-none" />
                         <button onClick={handleSendToThread} disabled={sending} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50">Send</button>
                     </div>
                 </>
             ) : (
                 <div className="flex-1 flex flex-col items-center justify-center text-slate-400">Select a chat</div>
             )}
         </div>
      </div>

      {/* Context Menu Overlay */}
      {contextMenu && (
          <div style={{ top: contextMenu.y, left: contextMenu.x }} className="fixed z-50 bg-white shadow-xl rounded-lg border w-32 py-1 overflow-hidden">
              <button onClick={() => setEditModal({ isOpen: true, msgId: contextMenu.msgId, text: contextMenu.text })} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm flex items-center gap-2 text-slate-700"><Edit size={14}/> Edit</button>
              <button onClick={() => handleDeleteMsg(contextMenu.msgId)} className="w-full text-left px-4 py-2 hover:bg-red-50 text-sm flex items-center gap-2 text-red-600"><Trash2 size={14}/> Delete</button>
          </div>
      )}

      {/* Edit Modal */}
      {editModal && (
          <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-2xl w-[400px]">
                  <h3 className="font-bold mb-4">Edit Message</h3>
                  <textarea rows={4} value={editModal.text} onChange={e => setEditModal({...editModal, text: e.target.value})} className="w-full border p-3 rounded-lg outline-none mb-4" />
                  <div className="flex justify-end gap-2">
                      <button onClick={() => setEditModal(null)} className="px-4 py-2 bg-slate-100 rounded-lg font-medium">Cancel</button>
                      <button onClick={handleEditSubmit} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium">Save Changes</button>
                  </div>
              </div>
          </div>
      )}

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl w-[450px]">
            <h3 className="font-bold text-lg mb-4">Initiate New SMS</h3>
            <input type="text" placeholder="+60123456789" value={newChatPhone} onChange={e => setNewChatPhone(e.target.value)} className="w-full p-3 border rounded-lg mb-4" />
            <textarea rows={4} placeholder="Message..." value={newChatMessage} onChange={e => setNewChatMessage(e.target.value)} className="w-full p-3 border rounded-lg mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNewChatModal(false)} className="px-4 py-2 bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleStartNewChat} disabled={sending} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}