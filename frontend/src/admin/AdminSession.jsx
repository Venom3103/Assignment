// src/admin/AdminSession.jsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

const API = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

export default function AdminSession() {
  const { id } = useParams();
  const [session, setSession] = useState(null);
  const [events, setEvents] = useState([]);
  const [report, setReport] = useState(null);

  async function loadSession() {
    try {
      const res = await axios.get(`${API}/api/session/${id}`);
      setSession(res.data.session);

      const evRes = await axios.get(`${API}/api/events/session/${id}`);
      setEvents(evRes.data.events || []);
    } catch (err) {
      console.error('Failed to load session:', err);
    }
  }

  async function generateReport() {
    try {
      const res = await axios.post(`${API}/api/generate-report/${id}`);
      setReport(res.data);
    } catch (err) {
      console.error('Failed to generate report:', err);
      alert('Report generation failed');
    }
  }

  useEffect(() => {
    if (id) loadSession();
  }, [id]);

  if (!session) return <div>Loading session...</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-4">
      <div className="lg:col-span-2">
        <Typography variant="h6" className="mb-2">{session.candidateName}</Typography>
        {session.videoPath ? (
          <video
            controls
            src={API + session.videoPath}
            className="w-full rounded-lg shadow"
          />
        ) : (
          <div>No video uploaded</div>
        )}
      </div>

      <div>
        <Typography variant="subtitle1" className="mb-2">Session Details</Typography>
        <div><strong>Started:</strong> {new Date(session.startedAt).toLocaleString()}</div>
        <div><strong>Ended:</strong> {session.endedAt ? new Date(session.endedAt).toLocaleString() : 'In Progress'}</div>

        <Button
          variant="contained"
          color="primary"
          className="mt-4"
          onClick={generateReport}
        >
          Generate Report
        </Button>

        {report && (
          <div className="mt-4 space-y-2">
            {report.pdf && <a href={API + report.pdf} target="_blank" className="text-blue-700">Download PDF</a>}
            {report.csv && <a href={API + report.csv} target="_blank" className="text-blue-700">Download CSV</a>}
          </div>
        )}

        <div className="mt-6">
          <Typography variant="subtitle1" className="mb-2">Live Events</Typography>
          {events.length === 0 ? (
            <div className="text-gray-500 text-sm">No events yet</div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-auto">
              {events.map((ev, idx) => (
                <div key={idx} className="p-2 border rounded bg-white">
                  <div className="flex justify-between items-center">
                    <div className="font-medium">{ev.type}</div>
                    <div className="text-xs text-gray-400">{new Date(ev.timestamp).toLocaleTimeString()}</div>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">{JSON.stringify(ev.details || {})}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
