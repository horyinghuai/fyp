"use client";

import { useState, useEffect } from 'react';
import { MessageSquare, Send, User } from 'lucide-react';

const CLINIC_ID = "c1111111-1111-1111-1111-111111111111";

export default function BotRepliesPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [groupedChats, setGroupedChats] = useState<Record<string, any[]>>({});
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  const fetchHistory = () => {
    fetch(`http://127.0.0.1:8000/admin/chat-history/${CLINIC_ID}`)
      .then(res => res.json())
      .then(data => {
        setHistory(data);
        const grouped = data.reduce((acc: any, curr: any) => {
            const key = curr.telegram_id || "System";
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

  const handleSendReply = async (msgId: number) => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
        const res = await fetch(`http://127.0.0.1:8000/admin/chat-reply`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ msg_id: msgId, reply_text: replyText })
        });
        if(res.ok) {
            setReplyText("");
            fetchHistory();
        } else {
            alert("Failed to send message. Please ensure Telegram Bot Token is valid in the backend.");
        }
    } catch (e) {
        alert("Server error.");
    }
    setSending(false);
  };

  if (isLoading) return <div className="animate-pulse h-[60vh] bg-slate-200 rounded-2xl"></div>;

  const users = Object.keys(groupedChats).sort((a, b) => {
      const aHasUnread = groupedChats[a].some(m => m.status === 'unread');
      const bHasUnread = groupedChats[b].some(m => m.status === 'unread');
      if (aHasUnread && !bHasUnread) return -1;
      if (!aHasUnread && bHasUnread) return 1;
      return 0;
  });

  return (
    <div className="max-w-6xl mx-auto h-[85vh] flex flex-col">
      <div className="mb-6 flex items-center justify-between">
        <div>
            <h1 className="text-3xl font-bold text-slate-800">🤖 Bot Replies & Chat</h1>
            <p className="text-slate-500 mt-1">Review inquiries, monitor AI responses, and reply directly to patients.</p>
        </div>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
         {/* Sidebar */}
         <div className="w-1/3 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
             <div className="p-4 border-b bg-slate-50 font-bold text-slate-600 flex justify-between">
                 Active Conversations
             </div>
             <div className="flex-1 overflow-y-auto">
                 {users.length === 0 ? (
                     <div className="p-6 text-center text-slate-400 text-sm">No conversations found.</div>
                 ) : (
                     users.map(u => {
                         const msgs = groupedChats[u];
                         const hasUnread = msgs.some(m => m.status === 'unread');
                         const isSelected = selectedUser === u;
                         
                         return (
                             <button key={u} onClick={() => setSelectedUser(u)} className={`w-full text-left p-4 border-b transition-colors flex items-start gap-3 ${isSelected ? 'bg-blue-50 border-l-4 border-l-blue-600' : 'hover:bg-slate-50 border-l-4 border-l-transparent'}`}>
                                 <div className={`p-2 rounded-full mt-1 ${hasUnread ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                                     <User size={18} />
                                 </div>
                                 <div className="flex-1 min-w-0">
                                     <div className="flex justify-between items-center mb-1">
                                         <span className="font-bold text-slate-800 truncate">ID: {u}</span>
                                         {hasUnread && <span className="bg-red-500 w-2 h-2 rounded-full shadow-sm"></span>}
                                     </div>
                                     <span className="text-xs text-slate-500 truncate block">
                                         {msgs[msgs.length - 1].message || "No text"}
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
             {selectedUser ? (
                 <>
                     <div className="p-4 border-b bg-slate-50 font-bold text-slate-600 shadow-sm z-10">
                         Chat History with {selectedUser}
                     </div>
                     <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
                         {groupedChats[selectedUser].map(msg => (
                             <div key={msg.id} className="space-y-4">
                                 {/* User Message Bubble */}
                                 {msg.message && (
                                    <div className="flex justify-start">
                                        <div className="bg-white border border-slate-200 p-4 rounded-2xl rounded-tl-sm max-w-[80%] shadow-sm">
                                            <span className="block text-[10px] font-bold text-slate-400 mb-2 uppercase">{new Date(msg.created_at).toLocaleString()}</span>
                                            <span className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{msg.message}</span>
                                            {msg.status === 'unread' && (
                                                <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
                                                    <input 
                                                        type="text" 
                                                        placeholder="Type reply to patient..." 
                                                        value={replyText} 
                                                        onChange={e => setReplyText(e.target.value)} 
                                                        className="flex-1 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm outline-none focus:border-blue-400"
                                                        onKeyDown={(e) => { if(e.key === 'Enter') handleSendReply(msg.id) }}
                                                    />
                                                    <button onClick={() => handleSendReply(msg.id)} disabled={sending || !replyText.trim()} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50">
                                                        <Send size={14} /> Send
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                 )}

                                 {/* Bot/Admin Reply Bubble */}
                                 {msg.reply && (
                                    <div className="flex justify-end">
                                        <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl rounded-tr-sm max-w-[80%] shadow-sm">
                                            <span className="block text-[10px] font-bold text-blue-400 mb-2 uppercase text-right">Bot / Admin Reply</span>
                                            <span className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{msg.reply}</span>
                                        </div>
                                    </div>
                                 )}
                             </div>
                         ))}
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
    </div>
  );
}