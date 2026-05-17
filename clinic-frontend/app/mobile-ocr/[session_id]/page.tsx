"use client";

import { useRef, useState, useEffect } from 'react';
import { Camera, UploadCloud } from 'lucide-react';
import { useParams } from 'next/navigation';

export default function MobileOcrPage() {
    const params = useParams();
    const sessionId = params.session_id;
    
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [success, setSuccess] = useState(false);

    const startCamera = async () => {
        setIsScanning(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            if (videoRef.current) videoRef.current.srcObject = stream;
        } catch(e) {
            alert("Camera access denied.");
        }
    };

    const captureAndUpload = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        setUploading(true);
        canvas.toBlob(async (blob) => {
            if(!blob) return;
            const form = new FormData();
            form.append("file", blob, "mykad.jpg");
            
            // Stop Camera
            const stream = video.srcObject as MediaStream;
            stream?.getTracks().forEach(t => t.stop());
            
            try {
                // IMPORTANT: Must point to your machine's LOCAL IP Address here as well
                const res = await fetch(`http://192.168.1.9:8000/admin/ocr-session/${sessionId}/upload`, { method: 'POST', body: form });
                if (res.ok) setSuccess(true);
            } catch(e) { alert("Upload Failed."); }
            setUploading(false);
        }, 'image/jpeg');
    };

    if (success) return <div className="h-screen flex items-center justify-center font-bold text-emerald-600 text-xl text-center px-6">Upload Complete! You can close this window and look at your computer.</div>;

    return (
        <div className="h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
            <h1 className="text-white text-2xl font-bold mb-6">AICAS MyKad Scanner</h1>
            {!isScanning ? (
                <button onClick={startCamera} className="bg-blue-600 text-white px-8 py-4 rounded-full font-bold shadow-lg flex items-center gap-3">
                    <Camera size={24} /> Tap to Open Camera
                </button>
            ) : (
                <div className="w-full max-w-sm flex flex-col items-center">
                    <video ref={videoRef} autoPlay playsInline className="w-full rounded-2xl border-4 border-blue-500 mb-6" />
                    <canvas ref={canvasRef} className="hidden" />
                    <button onClick={captureAndUpload} disabled={uploading} className="bg-emerald-500 text-white w-full py-4 rounded-full font-bold shadow-lg flex justify-center items-center gap-2">
                        {uploading ? "Uploading..." : <><UploadCloud size={24}/> Capture & Send</>}
                    </button>
                </div>
            )}
        </div>
    );
}