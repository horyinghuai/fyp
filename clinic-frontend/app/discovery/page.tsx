"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, MapPin, Phone, MessageCircle, Info } from 'lucide-react';

export default function DiscoveryPage() {
    const [clinics, setClinics] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    
    // State for zoomed QR Code
    const [zoomedQr, setZoomedQr] = useState<string | null>(null);

    const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'AICAS_Clinic_Bot';

    useEffect(() => {
        const fetchPublicClinics = async () => {
            try {
                const res = await fetch('http://127.0.0.1:8000/clinics');
                if (res.ok) {
                    setClinics(await res.json());
                }
            } catch (err) {
                console.error("Failed to load clinics.");
            }
            setIsLoading(false);
        };
        fetchPublicClinics();
    }, []);

    const filteredClinics = clinics.filter(c => 
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (c.address && c.address.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <div className="min-h-screen bg-slate-50">
            
            <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center sticky top-0 z-50">
                <div className="font-black text-2xl text-slate-800 flex items-center gap-2">
                    <span className="text-blue-600">⚡</span> AICAS Health
                </div>
                <Link href="/login" className="bg-slate-900 text-white px-5 py-2 rounded-xl font-bold text-sm shadow-md hover:bg-slate-800 transition">
                    Admin / Staff Login
                </Link>
            </nav>

            
            <div className="bg-blue-600 text-white pt-20 pb-24 px-4 text-center">
                <h1 className="text-4xl md:text-5xl font-black mb-4">Find your nearest clinic. <br/> Book directly on Telegram.</h1>
                <p className="text-blue-100 text-lg mb-10 max-w-2xl mx-auto">No waiting on hold. Connect instantly with our intelligent scheduling bot to book consultations, vaccines, and blood tests in seconds.</p>
                
                <div className="max-w-2xl mx-auto relative shadow-2xl rounded-2xl">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Search className="w-5 h-5 text-gray-500"/>
                    </div>
                    
                    <input 
                        type="text" 
                        placeholder="Search by clinic name or city..." 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full py-4 pl-14 pr-4 rounded-2xl text-lg text-slate-800 outline-none focus:ring-4 focus:ring-blue-300 transition bg-white"
                    />
                </div>
            </div>

            
            <div className="max-w-6xl mx-auto px-4 -mt-10 pb-20 relative z-10">
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {[1, 2, 3, 4].map(i => <div key={i} className="animate-pulse h-48 bg-slate-200 rounded-2xl shadow-xl"></div>)}
                    </div>
                ) : filteredClinics.length === 0 ? (
                    <div className="bg-white p-12 rounded-2xl shadow-xl text-center">
                        <Info size="{48}" className="mx-auto text-slate-300 mb-4"/>
                        <h2 className="text-2xl font-bold text-slate-800 mb-2">No clinics found</h2>
                        <p className="text-slate-500">We couldn't find any clinic matching "{searchQuery}". Try a different location.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {filteredClinics.map(clinic => {
                            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https://t.me/${botUsername}?start=${clinic.id}`;
                            return (
                                <div key={clinic.id} className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden flex flex-col hover:shadow-2xl transition duration-300">
                                    <div className="p-6 flex-1">
                                        <h3 className="text-xl font-bold text-slate-800 mb-3">{clinic.name}</h3>
                                        
                                        <div className="space-y-3 mb-6">
                                            <div className="flex items-start gap-3 text-slate-600 text-sm">
                                                <MapPin className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0"/>
                                                <span>{clinic.address || 'Address not provided'}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-slate-600 text-sm">
                                                <Phone className="w-5 h-5 text-blue-600 flex-shrink-0"/>
                                                <span>{clinic.contact_number || 'N/A'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="bg-slate-50 p-4 border-t flex items-center justify-between gap-4">
                                        <img 
                                            src={qrUrl} 
                                            alt="QR Code" 
                                            onClick={() => setZoomedQr(qrUrl)}
                                            className="w-16 h-16 rounded shadow-sm border border-slate-200 bg-white p-1 cursor-pointer hover:scale-105 transition"
                                            title="Click to enlarge"
                                        />
                                        <a 
                                            href={`https://t.me/${botUsername}?start=${clinic.id}`} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="flex-1 bg-blue-600 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 transition"
                                        >
                                            <MessageCircle className="w-5 h-5"/> Chat on Telegram
                                        </a>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            
            {zoomedQr && (
                <div 
                    className="fixed inset-0 bg-slate-900/80 flex items-center justify-center z-[100] backdrop-blur-sm cursor-pointer"
                    onClick={() => setZoomedQr(null)}
                >
                    <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-black text-slate-800 mb-6">Scan to Connect</h3>
                        <img src={zoomedQr} className="w-64 h-64 sm:w-80 sm:h-80 border-4 border-slate-100 rounded-2xl" />
                        <button onClick={() => setZoomedQr(null)} className="mt-8 bg-slate-100 text-slate-600 font-bold px-8 py-3 rounded-xl hover:bg-slate-200 transition">
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}