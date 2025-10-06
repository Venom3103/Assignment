import React, { useRef, useEffect, useState } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import { Button, Card, CardContent, CardHeader, Chip, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import * as tf from '@tensorflow/tfjs';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

export default function Interview() {
  const videoRef = useRef();
  const canvasRef = useRef();
  const mediaRecorderRef = useRef();
  const recordedChunksRef = useRef([]);
  const socketRef = useRef();
  const modelFaceRef = useRef(null);
  const modelObjRef = useRef(null);

  const [sessionId, setSessionId] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | starting | running | stopping | error
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [events, setEvents] = useState([]);
  const [reportModal, setReportModal] = useState({ open: false, pdf: null, csv: null });

  const lastFaceSeenAt = useRef(Date.now());
  const lookAwayStart = useRef(null);
  const lastObjectDetectAt = useRef(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await axios.post(`${API_BASE}/api/sessions`, { candidateName: 'Demo Candidate' });
        if (!mounted) return;
        setSessionId(res.data.sessionId);

        socketRef.current = io(API_BASE);
        socketRef.current.on('connect', () => {
          if (res.data.sessionId) socketRef.current.emit('join', res.data.sessionId);
        });
        socketRef.current.on('event', ev => setEvents(prev => [ev, ...prev]));

        await tf.ready();
        modelObjRef.current = await cocoSsd.load();

        modelFaceRef.current = await faceLandmarksDetection.createDetector(
          faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
          { runtime: 'tfjs', modelType: 'full' }
        );

        setModelsLoaded(true);
      } catch {
        setStatus('error');
      }
    })();
    return () => { mounted = false; socketRef.current && socketRef.current.disconnect(); };
  }, []);

  async function postEvent(type, details = {}) {
    if (!sessionId) return;
    const ev = { sessionId, type, timestamp: new Date().toISOString(), details };
    setEvents(prev => [ev, ...prev]);
    try { await axios.post(`${API_BASE}/api/events`, ev); } catch {}
    try { socketRef.current && socketRef.current.emit('event', ev); } catch {}
    // End interview immediately for misconduct
    if (['LOOK_AWAY', 'MULTIPLE_FACES', 'UNAUTHORIZED_ITEM'].includes(type)) {
      await endInterviewAndUpload();
    }
  }

  async function startInterview() {
    if (!modelsLoaded) return alert('Loading models — please wait a few seconds');
    try {
      setStatus('starting');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      recordedChunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
      mediaRecorderRef.current = mr;
      mr.ondataavailable = e => { if (e.data && e.data.size) recordedChunksRef.current.push(e.data); };
      mr.start(2000);

      setStatus('running');
      await postEvent('SESSION_START', {});
      runDetectors();
    } catch {
      setStatus('error');
    }
  }

  async function endInterviewAndUpload() {
    try {
      setStatus('stopping');
      const stream = videoRef.current?.srcObject;
      if (stream) stream.getTracks().forEach(t => t.stop());

      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== 'inactive') {
        const stopPromise = new Promise(resolve => mr.onstop = resolve);
        mr.stop();
        await stopPromise;
      }

      const chunks = recordedChunksRef.current;
      if (!chunks || chunks.length === 0) { setStatus('idle'); return; }
      const blob = new Blob(chunks, { type: 'video/webm' });
      const fd = new FormData();
      fd.append('video', blob, `${sessionId || 'session'}.webm`);
      fd.append('sessionId', sessionId);

      const res = await axios.post(`${API_BASE}/api/upload-video`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data && res.data.path) await postEvent('VIDEO_UPLOADED', { path: res.data.path });
      else await postEvent('VIDEO_UPLOAD_FAILED', {});
      await postEvent('SESSION_END', {});
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  async function runDetectors() {
    const video = videoRef.current;
    const faceDetector = modelFaceRef.current;
    const objModel = modelObjRef.current;
    const canvas = canvasRef.current;
    if (!video || !faceDetector || !objModel || !canvas) return;
    const ctx = canvas.getContext('2d');

    const NO_FACE_THRESHOLD = 10000;
    const LOOK_AWAY_THRESHOLD = 5000;
    const OBJECT_INTERVAL = 1000;
    let lastTick = 0;

    async function frame(now) {
      if (now - lastTick < 200) { requestAnimationFrame(frame); return; }
      lastTick = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      try {
        const faces = await faceDetector.estimateFaces(video, { flipHorizontal: false });
        const nowMs = Date.now();

        if (!faces || faces.length === 0) {
          if (nowMs - lastFaceSeenAt.current > NO_FACE_THRESHOLD) {
            await postEvent('NO_FACE', { durationMs: nowMs - lastFaceSeenAt.current });
            lastFaceSeenAt.current = nowMs;
          }
        } else {
          lastFaceSeenAt.current = nowMs;
          if (faces.length > 1) await postEvent('MULTIPLE_FACES', { count: faces.length });

          faces.forEach(f => {
            ctx.beginPath();
            f.keypoints.forEach((kp, i) => { if (i === 0) ctx.moveTo(kp.x, kp.y); else ctx.lineTo(kp.x, kp.y); });
            ctx.strokeStyle = 'lime'; ctx.lineWidth = 1; ctx.stroke();
          });

          try {
            const kp = faces[0].keypoints;
            const left = kp[33], right = kp[263], nose = kp[1] || kp[4];
            const eyeMidX = (left.x + right.x) / 2;
            const dx = (nose.x - eyeMidX) / video.videoWidth;
            if (Math.abs(dx) > 0.06) {
              if (!lookAwayStart.current) lookAwayStart.current = nowMs;
              else if (nowMs - lookAwayStart.current > LOOK_AWAY_THRESHOLD) {
                await postEvent('LOOK_AWAY', { dx, durationMs: nowMs - lookAwayStart.current });
                lookAwayStart.current = null;
              }
            } else lookAwayStart.current = null;
          } catch {}
        }

        if (nowMs - lastObjectDetectAt.current > OBJECT_INTERVAL) {
          lastObjectDetectAt.current = nowMs;
          const preds = await objModel.detect(video);
          preds.forEach(p => {
            const [x, y, w, h] = p.bbox;
            ctx.strokeStyle = 'red'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
            ctx.font = '14px Arial'; ctx.fillStyle = 'red';
            ctx.fillText(p.class, x, y > 10 ? y - 6 : 10);

            const label = p.class.toLowerCase();
            if (['cell phone', 'phone', 'book', 'notebook', 'laptop', 'tablet', 'paper'].some(k => label.includes(k)) && p.score > 0.55) {
              postEvent('UNAUTHORIZED_ITEM', { label: p.class, score: p.score, bbox: p.bbox });
            }
          });
        }
      } catch {}
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  async function generateReportAndShow() {
    if (!sessionId) return;
    try {
      const res = await axios.post(`${API_BASE}/api/generate-report/${sessionId}`);
      setReportModal({ open: true, pdf: res.data.pdf || null, csv: res.data.csv || null });
    } catch {}
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-4">
      <div className="lg:col-span-2">
        <Card className="shadow-lg rounded-xl overflow-hidden">
          <CardHeader title="Candidate Camera" subheader={sessionId ? `Session ${sessionId}` : 'Initializing...'} />
          <CardContent className="relative">
            <video ref={videoRef} width={900} height={560} playsInline muted className="w-full bg-black rounded" />
            <canvas ref={canvasRef} width={900} height={560} className="absolute top-0 left-0 w-full h-full pointer-events-none" />
            <div className="mt-4 flex items-center gap-3">
              <Button variant="contained" color="primary" onClick={startInterview} disabled={!modelsLoaded || status !== 'idle'}>
                {modelsLoaded ? 'Start Interview' : <CircularProgress size={18} />}
              </Button>
              <Button variant="outlined" color="error" onClick={endInterviewAndUpload}>End & Upload</Button>
              <Button variant="text" onClick={generateReportAndShow}>Generate Report</Button>
              <Chip label={status === 'running' ? 'Running' : status === 'starting' ? 'Starting' : 'Idle'} color={status === 'running' ? 'success' : 'default'} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <div className="sticky top-24">
          <Card className="shadow-lg rounded-xl p-4">
            <h3 className="text-lg font-semibold text-tutedude-800 mb-3">Live Events</h3>
            <div className="max-h-[56vh] overflow-auto space-y-2">
              {events.length === 0 ? <div className="text-sm text-gray-500">No events yet</div> :
                events.map((ev, idx) => (
                  <div key={idx} className="p-2 border rounded bg-white">
                    <div className="flex justify-between"><div className="font-medium">{ev.type}</div>
                      <div className="text-xs text-gray-400">{new Date(ev.timestamp).toLocaleTimeString()}</div>
                    </div>
                    <div className="text-xs mt-1 text-gray-600">{JSON.stringify(ev.details || {})}</div>
                  </div>
                ))
              }
            </div>
          </Card>
        </div>
      </div>

      <Dialog open={reportModal.open} onClose={() => setReportModal({ open: false, pdf: null, csv: null })}>
        <DialogTitle>Report Ready</DialogTitle>
        <DialogContent>
          {reportModal.pdf ? <a href={`${API_BASE}${reportModal.pdf}`} target="_blank">Download PDF</a> : <div>No PDF</div>}<br />
          {reportModal.csv ? <a href={`${API_BASE}${reportModal.csv}`} target="_blank">Download CSV</a> : <div>No CSV</div>}
        </DialogContent>
        <DialogActions><Button onClick={() => setReportModal({ open: false })}>Close</Button></DialogActions>
      </Dialog>
    </div>
  );
}
