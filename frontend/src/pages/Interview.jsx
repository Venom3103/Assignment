// src/pages/Interview.jsx
import React, { useRef, useEffect, useState } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
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
  const lastFaceSeenAt = useRef(Date.now());
  const lookAwayStart = useRef(null);
  const lastObjectDetectAt = useRef(0);

  const [sessionId, setSessionId] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | starting | running | stopping | error
  const [events, setEvents] = useState([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [reportModal, setReportModal] = useState({ open: false, pdf: null, csv: null });

  // ---------------- INIT ----------------
  useEffect(() => {
    let mounted = true;
    (async function init() {
      try {
        const res = await axios.post(`${API_BASE}/api/sessions`, { candidateName: 'Demo Candidate' });
        if (!mounted) return;
        setSessionId(res.data.sessionId);

        // Socket setup
        socketRef.current = io(API_BASE);
        socketRef.current.on('connect', () => {
          if (res.data.sessionId) socketRef.current.emit('join', res.data.sessionId);
        });
        socketRef.current.on('event', ev => setEvents(prev => [ev, ...prev]));

        // Load models
        await tf.ready();
        modelObjRef.current = await cocoSsd.load();
        modelFaceRef.current = await faceLandmarksDetection.load(
          faceLandmarksDetection.SupportedPackages.mediapipeFacemesh
        );
        setModelsLoaded(true);
        console.log('✅ Models loaded');
      } catch (err) {
        console.error('Init error:', err);
        alert('Failed to initialize session');
      }
    })();

    return () => {
      mounted = false;
      socketRef.current && socketRef.current.disconnect();
    };
  }, []);

  // ---------------- HELPERS ----------------
  async function postEvent(type, details = {}) {
    if (!sessionId) return;
    const ev = { sessionId, type, timestamp: new Date().toISOString(), details };
    setEvents(prev => [ev, ...prev]);
    try {
      await axios.post(`${API_BASE}/api/events`, ev);
      socketRef.current && socketRef.current.emit('event', ev);
    } catch (err) {
      console.warn('postEvent error:', err);
    }
  }

  // ---------------- START INTERVIEW ----------------
  async function startInterview() {
    if (!modelsLoaded) return alert('Models are still loading...');
    try {
      setStatus('starting');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true,
      });
      if (!videoRef.current) throw new Error('Video element not ready');
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      const mr = new MediaRecorder(stream, { mimeType: 'video/webm' });
      mediaRecorderRef.current = mr;
      recordedChunksRef.current = [];
      mr.ondataavailable = e => {
        if (e.data && e.data.size) recordedChunksRef.current.push(e.data);
      };
      mr.start(2000);

      setStatus('running');
      await postEvent('SESSION_START', {});

      // Start detectors asynchronously
      runDetectors().catch(err => console.error('Detector error:', err));
    } catch (err) {
      console.error('startInterview error:', err);
      alert('Failed to start interview');
      setStatus('idle');
    }
  }

  // ---------------- END INTERVIEW ----------------
  async function endInterviewAndUpload() {
    try {
      setStatus('stopping');
      const stream = videoRef.current?.srcObject;
      if (stream) stream.getTracks().forEach(t => t.stop());

      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== 'inactive') {
        const stopPromise = new Promise(resolve => (mr.onstop = resolve));
        mr.stop();
        await stopPromise;
      }

      const chunks = recordedChunksRef.current;
      if (!chunks.length) return setStatus('idle');

      const blob = new Blob(chunks, { type: 'video/webm' });
      const fd = new FormData();
      fd.append('video', blob, `${sessionId}.webm`);
      fd.append('sessionId', sessionId);

      const res = await axios.post(`${API_BASE}/api/upload-video`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data.path) await postEvent('VIDEO_UPLOADED', { path: res.data.path });
      else await postEvent('VIDEO_UPLOAD_FAILED', {});

      await postEvent('SESSION_END', {});
      setStatus('idle');
    } catch (err) {
      console.error('endInterview error:', err);
      alert('Failed to end interview');
      setStatus('error');
    }
  }

  // ---------------- DETECTORS ----------------
  async function runDetectors() {
    const video = videoRef.current;
    const faceModel = modelFaceRef.current;
    const objModel = modelObjRef.current;
    const canvas = canvasRef.current;
    if (!video || !faceModel || !objModel || !canvas) return;

    const ctx = canvas.getContext('2d');
    const NO_FACE_THRESHOLD = 10000;
    const LOOK_AWAY_THRESHOLD = 5000;
    const OBJECT_INTERVAL = 1000;

    let last = 0;

    async function frame(now) {
      if (status !== 'running') return; // stop detection if not running
      if (now - last > 300) {
        last = now;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        try {
          // FACE DETECTION
          const faces = await faceModel.estimateFaces({ input: video });
          const nowTime = Date.now();

          if (faces?.length) {
            faces.forEach(f => {
              ctx.beginPath();
              f.scaledMesh.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
              ctx.strokeStyle = 'lime';
              ctx.stroke();
            });
          }

          // FACE EVENTS
          if (!faces || faces.length === 0) {
            if (nowTime - lastFaceSeenAt.current > NO_FACE_THRESHOLD) {
              await postEvent('NO_FACE', { durationMs: nowTime - lastFaceSeenAt.current });
              lastFaceSeenAt.current = nowTime;
            }
          } else {
            lastFaceSeenAt.current = nowTime;
            if (faces.length > 1) await postEvent('MULTIPLE_FACES', { count: faces.length });

            // LOOK_AWAY
            const kp = faces[0].scaledMesh;
            const left = kp[33];
            const right = kp[263];
            const nose = kp[1];
            const eyeMidX = (left[0] + right[0]) / 2;
            const dx = (nose[0] - eyeMidX) / video.videoWidth;
            if (Math.abs(dx) > 0.06) {
              if (!lookAwayStart.current) lookAwayStart.current = nowTime;
              else if (nowTime - lookAwayStart.current > LOOK_AWAY_THRESHOLD) {
                await postEvent('LOOK_AWAY', { dx, durationMs: nowTime - lookAwayStart.current });
                lookAwayStart.current = null;
              }
            } else {
              lookAwayStart.current = null;
            }
          }

          // OBJECT DETECTION
          if (nowTime - lastObjectDetectAt.current > OBJECT_INTERVAL) {
            lastObjectDetectAt.current = nowTime;
            const preds = await objModel.detect(video);
            preds.forEach(p => {
              const [x, y, w, h] = p.bbox;
              ctx.strokeStyle = 'red';
              ctx.lineWidth = 2;
              ctx.strokeRect(x, y, w, h);
              ctx.font = '14px Arial';
              ctx.fillStyle = 'red';
              ctx.fillText(p.class, x, y > 10 ? y - 5 : 10);

              const label = p.class.toLowerCase();
              if (['cell phone', 'phone', 'book', 'notebook', 'laptop', 'tablet'].some(k => label.includes(k)) && p.score > 0.6) {
                postEvent('UNAUTHORIZED_ITEM', { label: p.class, score: p.score, bbox: p.bbox });
              }
            });
          }
        } catch (err) {
          console.warn('Detection frame error:', err);
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ---------------- REPORT ----------------
  async function generateReportAndShow() {
    if (!sessionId) return alert('No session found');
    try {
      const res = await axios.post(`${API_BASE}/api/generate-report/${sessionId}`);
      setReportModal({ open: true, pdf: res.data.pdf, csv: res.data.csv });
    } catch (err) {
      console.error('report error:', err);
      alert('Report generation failed');
    }
  }

  // ---------------- RENDER ----------------
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Card className="shadow-lg rounded-xl overflow-hidden">
          <CardHeader
            title="Candidate Camera"
            subheader={sessionId ? `Session: ${sessionId}` : 'Initializing session...'}
          />
          <CardContent className="relative">
            <video
              ref={videoRef}
              width={900}
              height={560}
              playsInline
              muted
              className="w-full bg-black rounded"
            />
            <canvas
              ref={canvasRef}
              width={900}
              height={560}
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
            />

            <div className="mt-4 flex items-center gap-3">
              <Button
                variant="contained"
                color="primary"
                onClick={startInterview}
                disabled={status !== 'idle'}
              >
                {status === 'starting' ? (
                  <div className="flex items-center gap-2">
                    <CircularProgress size={20} color="inherit" />
                    Starting...
                  </div>
                ) : status === 'running' ? (
                  'Interview Running'
                ) : (
                  'Start Interview'
                )}
              </Button>

              <Button
                variant="outlined"
                color="error"
                onClick={endInterviewAndUpload}
                disabled={status !== 'running'}
              >
                End & Upload
              </Button>

              <Button
                variant="text"
                onClick={generateReportAndShow}
                disabled={status === 'starting'}
              >
                Generate Report
              </Button>

              <Chip
                label={
                  status === 'running'
                    ? 'Running'
                    : status === 'starting'
                    ? 'Starting...'
                    : status === 'stopping'
                    ? 'Stopping...'
                    : status === 'error'
                    ? 'Error'
                    : 'Idle'
                }
                color={
                  status === 'running'
                    ? 'success'
                    : status === 'error'
                    ? 'error'
                    : 'default'
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <div className="sticky top-24">
          <Card className="shadow-lg rounded-xl p-4">
            <h3 className="text-lg font-semibold text-tutedude-800 mb-3">Live Events</h3>
            <div className="max-h-[56vh] overflow-auto space-y-2">
              {events.length === 0 ? (
                <div className="text-sm text-gray-500">No events yet</div>
              ) : (
                events.map((ev, idx) => (
                  <div key={idx} className="p-2 border rounded bg-white">
                    <div className="flex justify-between items-center">
                      <div className="font-medium">{ev.type}</div>
                      <div className="text-xs text-gray-400">
                        {new Date(ev.timestamp || Date.now()).toLocaleTimeString()}
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {JSON.stringify(ev.details || {})}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Report Modal */}
      <Dialog open={reportModal.open} onClose={() => setReportModal({ open: false })}>
        <DialogTitle>Report Ready</DialogTitle>
        <DialogContent>
          <div className="space-y-2">
            {reportModal.pdf ? (
              <a href={`${API_BASE}${reportModal.pdf}`} target="_blank" rel="noreferrer">
                Download PDF
              </a>
            ) : (
              <div>No PDF generated</div>
            )}
            {reportModal.csv ? (
              <a href={`${API_BASE}${reportModal.csv}`} target="_blank" rel="noreferrer">
                Download CSV
              </a>
            ) : (
              <div>No CSV generated</div>
            )}
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReportModal({ open: false })}>Close</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
