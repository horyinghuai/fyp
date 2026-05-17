"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function MobileOcrPage() {
    const params = useParams();
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (params && params.session_id) {
            setSessionId(params.session_id as string);
        }
    }, [params]);

    const handleMobileCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0 || !sessionId) return;
        setUploading(true);
        
        const form = new FormData();
        form.append("file", e.target.files[0], "mykad-mobile.jpg");
        
        try {
            // Replace with your laptop's Wi-Fi IP address
            const res = await fetch(`http://192.168.1.9:8000/admin/ocr-session/${sessionId}/upload`, { 
                method: 'POST', body: form 
            });
            if (res.ok) setSuccess(true);
            else alert("Failed to process image.");
        } catch(err) { 
            alert("Network error. Ensure your phone and PC are connected to the exact same Wi-Fi."); 
        }
        setUploading(false);
    };

    if (success) {
        return (
            <div className="h-screen flex items-center justify-center bg-white p-6">
                <h2 className="font-bold text-emerald-600 text-2xl text-center">Scan Complete!<br/><br/>Look at your computer screen.</h2>
            </div>
        );
    }

    return (
        <div className="h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
            <h1 className="text-white text-3xl font-bold mb-8">AICAS Secure Scanner</h1>
            
            <label className={`relative overflow-hidden bg-blue-500 text-white px-8 py-6 rounded-2xl font-bold text-xl shadow-lg cursor-pointer transition ${uploading ? 'opacity-50' : 'active:bg-blue-600'}`}>
                {uploading ? "Uploading..." : "📷 Tap to Open Camera"}
                <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment" 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                    onChange={handleMobileCapture} 
                    disabled={uploading} 
                />
            </label>
            
            <p className="text-slate-400 mt-8 text-sm">Place your MyKad on a flat, well-lit surface before taking the photo.</p>
        </div>
    );
}