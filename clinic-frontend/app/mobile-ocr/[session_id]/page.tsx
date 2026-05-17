"use client";

import { useState } from 'react';
import { Camera, UploadCloud } from 'lucide-react';
import { useParams } from 'next/navigation';

export default function MobileOcrPage() {
    const params = useParams();
    const sessionId = params.session_id;
    const [uploading, setUploading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleMobileCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        
        setUploading(true);
        const form = new FormData();
        form.append("file", file, "mykad-mobile.jpg");
        
        try {
            // Using 192.168.1.9 based on your prompt
            const res = await fetch(`http://192.168.1.9:8000/admin/ocr-session/${sessionId}/upload`, { 
                method: 'POST', body: form 
            });
            if (res.ok) setSuccess(true);
            else alert("Failed to process image.");
        } catch(err) { 
            alert("Network error. Make sure your phone and laptop are connected to the exact same Wi-Fi."); 
        }
        setUploading(false);
    };

    if (success) return <div className="h-screen flex items-center justify-center font-bold text-emerald-600 text-xl text-center px-6">Scan Complete! You can close this window and look at your computer screen.</div>;

    return (
        <div className="h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
            <h1 className="text-white text-2xl font-bold mb-6">AICAS Secure Scanner</h1>
            
            <label className={`relative overflow-hidden bg-blue-600 text-white px-8 py-5 rounded-full font-bold shadow-lg flex items-center gap-3 cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                {uploading ? <UploadCloud size={24} className="animate-bounce" /> : <Camera size={24} />}
                {uploading ? "Analyzing Image..." : "Tap to Open Camera"}
                {/* Ensure the input fills the button but is invisible, preventing browser security blocks */}
                <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment" 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                    onChange={handleMobileCapture} 
                />
            </label>
            
            <p className="text-slate-400 mt-6 text-sm text-center">Place your MyKad on a flat, well-lit surface before taking the photo.</p>
        </div>
    );
}