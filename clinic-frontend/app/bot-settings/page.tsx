"use client";

import { useState, useEffect, useMemo } from 'react';
import { MessageSquare, Send, User, Search, PlusCircle, X, Smartphone } from 'lucide-react';

const CLINIC_ID = "c1111111-1111-1111-1111-111111111111";

export default function BotRepliesPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [groupedChats, setGroupedChats] = useState<Record<string, any[]>>({});
  const [selectedUserPhone, setSelectedUserPhone] = useState<string | null>(null);
  
  // General thread reply
  const [threadReplyText, setThreadReplyText] = useState("");
  const [sending, setSending] = useState(false);

  // Search State
  const [searchTerm, setSearchTerm] = useState("");

  // New Chat Modal State
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState("");
  const [newChatMessage, setNewChatMessage] = useState("");

  const fetchHistory = () => {
    fetch(`http://127.0.0.1:8000/admin/chat-history/${CLINIC_ID}`)
      .then(res => res.json())
      .then(data => {
        setHistory(data);
        const grouped = data.reduce((acc: any, curr: any) => {
            const key = curr.phone || "System";
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
    fetchHistory();
    const interval = setInterval(fetchHistory, 10000); 
    return () => clearInterval(interval);
  }, []);

  const handleSendToThread = async () => {
    if (!threadReplyText.trim() || !selectedUserPhone) return;
    setSending(true);
    try {
        const res = await fetch(`http://127.0.0.1:8000/admin/chat-reply`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: selectedUserPhone, clinic_id: CLINIC_ID, reply_text: threadReplyText })
        });
        if(res.ok) {
            setThreadReplyText("");
            fetchHistory();
        } else {
            alert("Failed to send message. Please check backend connection.");
        }
    } catch (e) {
        alert("Server error.");
    }
    setSending(false);
  };

  const handleStartNewChat = async () => {
    if (!newChatPhone.trim() || !newChatMessage.trim()) {
        alert("Phone number and message are required.");
        return;
    }

    setSending(true);
    try {
        const res = await fetch(`http://127.0.0.1:8000/admin/chat-reply`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: newChatPhone, clinic_id: CLINIC_ID, reply_text: newChatMessage })
        });
        if(res.ok) {
            setNewChatPhone("");
            setNewChatMessage("");
            setShowNewChatModal(false);
            fetchHistory();
            setSelectedUserPhone(newChatPhone);
        } else {
            alert("Failed to send message.");
        }
    } catch (e) {
        alert("Server error.");
    }
    setSending(false);
  };

  const filteredUsers = useMemo(() => {
      const lowerSearch = searchTerm.toLowerCase();
      return Object.keys(groupedChats).filter(phone => {
          if (phone.toLowerCase().includes(lowerSearch)) return true;
          // Safely check messages
          return (groupedChats[phone] || []).some(msg => 
              (msg.message && msg.message.toLowerCase().includes(lowerSearch)) || 
              (msg.reply && msg.reply.toLowerCase().includes(lowerSearch))
          );
      }).sort((a, b) => {
          // Safely check unread status
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
            <p className="text-slate-500 mt-1">Review Telegram and SMS inquiries, monitor AI responses, and reply directly.</p>
        </div>
        <button onClick={() => setShowNewChatModal(true)} className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md hover:bg-emerald-700 flex items-center gap-2">
            <PlusCircle size={18} /> New Chat
        </button>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
         {/* Sidebar */}
         <div className="w-1/3 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
             <div className="p-4 border-b bg-slate-50 flex flex-col gap-3">
                 <span className="font-bold text-slate-600">Active Conversations</span>
                 <div className="relative">
                     <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
                     <input 
                        type="text" 
                        placeholder="Search chats or phone numbers..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border rounded-lg outline-none text-sm bg-white"
                     />
                 </div>
             </div>
             <div className="flex-1 overflow-y-auto">
                 {filteredUsers.length === 0 ? (
                     <div className="p-6 text-center text-slate-400 text-sm">No conversations found matching search.</div>
                 ) : (
                     filteredUsers.map(phone => {
                         const msgs = groupedChats[phone] || [];
                         const hasUnread = msgs.some(m => m.status === 'unread');
                         const isSelected = selectedUserPhone === phone;
                         
                         const latestMsg = msgs.length > 0 ? msgs[msgs.length - 1] : {};
                         const isSms = latestMsg.channel === 'sms';
                         
                         // Fix applied: Override [Admin Initiated Chat] so it displays the actual text, properly fallback to reply or message 
                         const displayPreview = latestMsg.reply || latestMsg.message || "No text";
                         
                         return (
                             <button key={phone} onClick={() => setSelectedUserPhone(phone)} className={`w-full text-left p-4 border-b transition-colors flex items-start gap-3 ${isSelected ? 'bg-blue-50 border-l-4 border-l-blue-600' : 'hover:bg-slate-50 border-l-4 border-l-transparent'}`}>
                                 <div className={`p-2 rounded-full mt-1 ${hasUnread ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                                     {isSms ? <Smartphone size={18} /> : <MessageSquare size={18} />}
                                 </div>
                                 <div className="flex-1 min-w-0">
                                     <div className="flex justify-between items-center mb-1">
                                         <span className="font-bold text-slate-800 truncate">{phone}</span>
                                         {hasUnread && <span className="bg-red-500 w-2 h-2 rounded-full shadow-sm"></span>}
                                     </div>
                                     <span className="text-xs text-slate-500 truncate block">
                                         {displayPreview}
                                     </span>
                                 </div>
                             </button>
                         )
                     })
                 )}
             </div>
         </div>

         {/* Chat Area */}
         <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden relative">
             {selectedUserPhone ? (
                 <>
                     <div className="p-4 border-b bg-slate-50 font-bold text-slate-600 shadow-sm z-10 flex justify-between items-center">
                         <span>Chat History with {selectedUserPhone}</span>
                     </div>
                     <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50 flex flex-col">
                         {/* Safely map the array with || [] to prevent crashes on missing properties */}
                         {(groupedChats[selectedUserPhone] || []).map(msg => {
                             const isSms = msg.channel === 'sms';
                             return (
                             <div key={msg.id} className="space-y-4">
                                 {/* User Message Bubble */}
                                 {msg.message && msg.message !== "[Admin Initiated Chat]" && (
                                    <div className="flex justify-start">
                                        <div className="bg-white border border-slate-200 p-4 rounded-2xl rounded-tl-sm max-w-[80%] shadow-sm">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase">{new Date(msg.created_at).toLocaleString()}</span>
                                                <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                                                    {isSms ? <Smartphone size={10} /> : <MessageSquare size={10} />}
                                                    {isSms ? 'SMS' : 'TELEGRAM'}
                                                </span>
                                            </div>
                                            <span className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{msg.message}</span>
                                        </div>
                                    </div>
                                 )}

                                 {/* Bot/Admin Reply Bubble */}
                                 {msg.reply && (
                                    <div className="flex justify-end">
                                        <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl rounded-tr-sm max-w-[80%] shadow-sm">
                                            <div className="flex justify-end items-center gap-2 mb-2">
                                                <span className="flex items-center gap-1 text-[10px] font-bold text-blue-400 bg-white px-2 py-0.5 rounded-md shadow-sm border border-blue-50">
                                                    {isSms ? <Smartphone size={10} /> : <MessageSquare size={10} />}
                                                    {isSms ? 'SENT VIA SMS' : 'SENT VIA TELEGRAM'}
                                                </span>
                                                <span className="text-[10px] font-bold text-blue-400 uppercase text-right">Bot / Admin Reply</span>
                                            </div>
                                            <span className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{msg.reply}</span>
                                        </div>
                                    </div>
                                 )}
                             </div>
                         )})}
                     </div>
                     {/* Bottom Input Area */}
                     <div className="p-4 border-t bg-white">
                         <div className="flex gap-2">
                             <input 
                                 type="text" 
                                 placeholder={`Message ${selectedUserPhone}...`}
                                 value={threadReplyText}
                                 onChange={e => setThreadReplyText(e.target.value)}
                                 onKeyDown={(e) => { if (e.key === 'Enter') handleSendToThread() }}
                                 className="flex-1 bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm outline-none focus:border-blue-400"
                             />
                             <button onClick={handleSendToThread} disabled={sending || !threadReplyText.trim()} className="bg-blue-600 text-white px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50 transition-colors">
                                 <Send size={16} /> Send
                             </button>
                         </div>
                     </div>
                 </>
             ) : (
                 <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                     <MessageSquare size={48} className="mb-4 opacity-50" />
                     <p className="font-medium">Select a conversation to view chat history.</p>
                 </div>
             )}
         </div>
      </div>

      {showNewChatModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-[450px]">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h3 className="font-bold text-lg text-slate-800">Initiate New Chat</h3>
                <button onClick={() => setShowNewChatModal(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={20}/></button>
            </div>
            
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Patient Phone Number</label>
                    <input 
                        type="text" 
                        placeholder="+60123456789" 
                        value={newChatPhone} 
                        onChange={e => setNewChatPhone(e.target.value)} 
                        className="w-full p-3 border rounded-lg outline-none font-mono text-sm" 
                    />
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Message</label>
                    <textarea 
                        rows={4}
                        placeholder="Type your message to the patient here..." 
                        value={newChatMessage} 
                        onChange={e => setNewChatMessage(e.target.value)} 
                        className="w-full p-3 border rounded-lg outline-none text-sm resize-none" 
                    />
                </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowNewChatModal(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-medium hover:bg-slate-200 transition">Cancel</button>
              <button onClick={handleStartNewChat} disabled={sending} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50">Send Message</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}