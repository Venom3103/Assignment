import React, { useRef, useEffect, useState } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Divider,
} from '@mui/material';
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
  const [status, setStatus] = useState('idle');
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
        // Create detector with maxFaces to enable multiple face detection
        modelFaceRef.current = await faceLandmarksDetection.createDetector(
          faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
          { runtime: 'tfjs', modelType: 'full', maxFaces: 3 } // <-- added maxFaces
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

  // ---------- UPDATED runDetectors (focus + multiple-face fixes) ----------
  async function runDetectors() {
    const video = videoRef.current;
    const faceDetector = modelFaceRef.current;
    const objModel = modelObjRef.current;
    const canvas = canvasRef.current;
    if (!video || !faceDetector || !objModel || !canvas) return;
    const ctx = canvas.getContext('2d');

    // thresholds and state trackers
    const NO_FACE_THRESHOLD = 3000; // 3 sec
    const LOOK_AWAY_THRESHOLD = 0.04; // horizontal shift ratio (sensitive)
    const LOOK_AWAY_TIME = 1500; // 1.5 sec away before logging focus lost
    const FOCUS_REGAIN_TIME = 800; // 0.8 sec stable before regaining
    const OBJECT_INTERVAL = 1200; // ms between object detections

    let lastTick = 0;
    let isLookingAway = false;
    let lookAwayStartTime = null;
    let focusRegainTimer = null;
    let focusLostLogged = false;

    async function frame(now) {
      if (now - lastTick < 200) { requestAnimationFrame(frame); return; }
      lastTick = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      try {
        const nowMs = Date.now();
        // estimateFaces returns array (we set maxFaces on creation)
        const faces = await faceDetector.estimateFaces(video, { flipHorizontal: false });

        if (!faces || faces.length === 0) {
          // 🔹 No face detected
          if (nowMs - lastFaceSeenAt.current > NO_FACE_THRESHOLD) {
            console.log("⚠️ No face detected");
            await postEvent("NO_FACE", { durationMs: nowMs - lastFaceSeenAt.current });
            lastFaceSeenAt.current = nowMs;
          }
          // reset focus flags
          isLookingAway = false;
          lookAwayStartTime = null;
          focusLostLogged = false;
          if (focusRegainTimer) { clearTimeout(focusRegainTimer); focusRegainTimer = null; }
        } else {
          // update last seen
          lastFaceSeenAt.current = nowMs;

          // MULTIPLE FACES: if >1, post event (keeps single-face workflow otherwise)
          if (faces.length > 1) {
            console.log("⚠️ Multiple faces detected:", faces.length);
            // send MULTIPLE_FACES event with count and do not continue focus logic on multiple faces
            await postEvent("MULTIPLE_FACES", { count: faces.length });
            // draw boxes for visual debugging
            faces.forEach((f, idx) => {
              // some detector implementations include boundingBox or keypoints -> try boundingBox first
              if (f.box) {
                const x = f.box.xMin || f.box.left || 0;
                const y = f.box.yMin || f.box.top || 0;
                const w = (f.box.xMax || (x + (f.box.width || 0))) - x;
                const h = (f.box.yMax || (y + (f.box.height || 0))) - y;
                ctx.strokeStyle = '#FF3B30';
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, w, h);
              } else if (f.boundingBox) {
                const [x1, y1] = f.boundingBox.topLeft || [0, 0];
                const [x2, y2] = f.boundingBox.bottomRight || [0, 0];
                ctx.strokeStyle = '#FF3B30';
                ctx.lineWidth = 2;
                ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
              } else {
                // fallback: draw keypoints
                ctx.beginPath();
                f.keypoints.forEach((kp, i) => i === 0 ? ctx.moveTo(kp.x, kp.y) : ctx.lineTo(kp.x, kp.y));
                ctx.strokeStyle = '#FF3B30';
                ctx.lineWidth = 1.5;
                ctx.stroke();
              }
            });
            // skip single-face focus detection when multiple faces present
          } else {
            // Single face path: compute focus/dx
            const face = faces[0];

            // draw keypoints for the detected face
            try {
              ctx.beginPath();
              face.keypoints.forEach((kp, i) => {
                if (i === 0) ctx.moveTo(kp.x, kp.y);
                else ctx.lineTo(kp.x, kp.y);
              });
              ctx.strokeStyle = "#00FFB2";
              ctx.lineWidth = 1.5;
              ctx.stroke();
            } catch (e) {
              // ignore drawing errors
            }

       
try {
  const kp = face.keypoints;

  // Landmarks for left/right eye corners and nose tip
  const leftEye = kp[33];   // left eye outer corner
  const rightEye = kp[263]; // right eye outer corner
  const nose = kp[1];       // nose tip

  // Compute midpoints
  const midEyeX = (leftEye.x + rightEye.x) / 2;
  const midEyeY = (leftEye.y + rightEye.y) / 2;

  // Horizontal displacement (focus loss left/right)
  const dx = (nose.x - midEyeX) / video.videoWidth;

  // Vertical displacement (focus loss up/down)
  const dy = (nose.y - midEyeY) / video.videoHeight;

  // Calculate angular deviation magnitude
  const deviation = Math.sqrt(dx * dx + dy * dy);

  // Log values for debugging
  console.log(`🎯 deviation = ${deviation.toFixed(4)} (dx=${dx.toFixed(4)}, dy=${dy.toFixed(4)})`);

  // Adjusted sensitivity — higher = stricter
  const DEVIATION_THRESHOLD = 0.035;

  if (deviation > DEVIATION_THRESHOLD) {
    if (!isLookingAway) {
      lookAwayStartTime = nowMs;
      isLookingAway = true;
      console.log("👀 Possible focus loss started...");
    } else if (nowMs - lookAwayStartTime > LOOK_AWAY_TIME && !focusLostLogged) {
      console.log("❌ Focus lost (user looked away)");
      await postEvent("FOCUS_LOST", { deviation, dx, dy, durationMs: nowMs - lookAwayStartTime });
      focusLostLogged = true;
    }
  } else {
    if (isLookingAway && focusLostLogged) {
      if (!focusRegainTimer) {
        focusRegainTimer = setTimeout(async () => {
          console.log("✅ Focus regained");
          await postEvent("FOCUS_REGAINED", { deviation, dx, dy });
          isLookingAway = false;
          focusLostLogged = false;
          focusRegainTimer = null;
        }, FOCUS_REGAIN_TIME);
      }
    } else {
      isLookingAway = false;
      lookAwayStartTime = null;
    }
  }
} catch (err) {
  console.log("⚠️ Focus logic error:", err.message);
}

          }
        }

        // Object detection (every OBJECT_INTERVAL ms)
        if (Date.now() - lastObjectDetectAt.current > OBJECT_INTERVAL) {
          lastObjectDetectAt.current = Date.now();
          try {
            const preds = await objModel.detect(video);
            preds.forEach(p => {
              const [x, y, w, h] = p.bbox;
              ctx.strokeStyle = "rgba(255, 60, 60, 0.8)";
              ctx.lineWidth = 2;
              ctx.strokeRect(x, y, w, h);
              ctx.font = "14px Poppins";
              ctx.fillStyle = "#FF3C3C";
              ctx.fillText(p.class, x, y > 10 ? y - 6 : 10);

              const label = p.class.toLowerCase();
              if (
                ["cell phone", "phone", "book", "notebook", "laptop", "tablet", "paper"].some(k =>
                  label.includes(k)
                ) && p.score > 0.55
              ) {
                console.log("🚫 Unauthorized item detected:", p.class);
                postEvent("UNAUTHORIZED_ITEM", { label: p.class, score: p.score, bbox: p.bbox });
              }
            });
          } catch (odErr) {
            console.log("⚠️ Object detect error:", odErr.message);
          }
        }
      } catch (err) {
        console.log("⚠️ Detection error:", err.message);
      }

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  // ---------- end runDetectors ----------

  async function generateReportAndShow() {
    if (!sessionId) return;
    try {
      const res = await axios.post(`${API_BASE}/api/generate-report/${sessionId}`);
      setReportModal({ open: true, pdf: res.data.pdf || null, csv: res.data.csv || null });
    } catch {}
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white p-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Video Section */}
        <Card className="lg:col-span-2 bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl">
          <CardHeader
            title={<Typography variant="h6" className="text-white font-semibold">Candidate Camera</Typography>}
            subheader={<span className="text-gray-400">{sessionId ? `Session: ${sessionId}` : 'Initializing...'}</span>}
          />
          <Divider className="border-white/10" />
          <CardContent className="relative">
            <video ref={videoRef} width={900} height={560} playsInline muted className="w-full rounded-xl bg-black border border-white/10" />
            <canvas ref={canvasRef} width={900} height={560} className="absolute top-0 left-0 w-full h-full pointer-events-none" />
            <div className="mt-6 flex flex-wrap gap-3 items-center">
              <Button
                variant="contained"
                sx={{ bgcolor: '#00E676', '&:hover': { bgcolor: '#00C853' } }}
                onClick={startInterview}
                disabled={!modelsLoaded || status !== 'idle'}
              >
                {modelsLoaded ? 'Start Interview' : <CircularProgress size={18} sx={{ color: 'white' }} />}
              </Button>
              <Button variant="contained" color="error" onClick={endInterviewAndUpload}>End & Upload</Button>
              <Button variant="outlined" sx={{ color: 'white', borderColor: 'white' }} onClick={generateReportAndShow}>
                Generate Report
              </Button>
              <Chip
                label={status === 'running' ? 'Running' : status === 'starting' ? 'Starting' : 'Idle'}
                color={status === 'running' ? 'success' : 'default'}
                variant="outlined"
                sx={{ borderColor: '#00E676', color: '#00E676' }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Live Events */}
        <div className="relative">
          <div className="sticky top-20">
            <Card className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl p-4">
              <Typography variant="h6" className="text-white mb-3">Live Events</Typography>
              <Divider className="border-white/10 mb-3" />
              <div className="max-h-[58vh] overflow-auto space-y-2 custom-scrollbar">
                {events.length === 0 ? (
                  <div className="text-gray-400 text-sm">No events yet</div>
                ) : (
                  events.map((ev, idx) => (
                    <div key={idx} className="p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition">
                      <div className="flex justify-between">
                        <span className="font-semibold text-green-400">{ev.type}</span>
                        <span className="text-xs text-gray-400">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-xs text-gray-300 mt-1">{JSON.stringify(ev.details || {})}</div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Report Modal */}
      <Dialog open={reportModal.open} onClose={() => setReportModal({ open: false, pdf: null, csv: null })}>
        <DialogTitle>Report Ready</DialogTitle>
        <DialogContent>
          {reportModal.pdf ? <a href={`${API_BASE}${reportModal.pdf}`} target="_blank">Download PDF</a> : <div>No PDF</div>}<br />
          {reportModal.csv ? <a href={`${API_BASE}${reportModal.csv}`} target="_blank">Download CSV</a> : <div>No CSV</div>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReportModal({ open: false })}>Close</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
