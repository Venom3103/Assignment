// frontend/src/pages/AdminSession.jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import io from 'socket.io-client';
const API = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

export default function AdminSession(){
  const { id } = useParams();
  const [session, setSession] = useState(null);
  const [report, setReport] = useState(null);
  const [events, setEvents] = useState([]);
  const socketRef = React.useRef();

  useEffect(()=>{ if(id) load(); return ()=>{ socketRef.current && socketRef.current.disconnect(); } },[id]);

  async function load(){
    try {
      const res = await axios.get(API + '/api/session/' + id);
      setSession(res.data.session);
      const evRes = await axios.get(API + '/api/events/session/' + id);
      setEvents(evRes.data.events || []);
      // socket connect and join
      socketRef.current = io(API);
      socketRef.current.on('connect', ()=> socketRef.current.emit('join', id));
      socketRef.current.on('event', ev => setEvents(prev => [ev, ...prev]));
    } catch(e){ console.warn(e); }
  }

  async function genReport(){
    try {
      const res = await axios.post(API + '/api/generate-report/' + id);
      setReport(res.data);
      alert('Report generated');
    } catch(e){ console.error(e); alert('failed'); }
  }

  if(!session) return <div>Loading...</div>;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Card className="card-shadow"><CardContent>
          <Typography variant="h6">{session.candidateName}</Typography>
          {session.videoPath ? <video controls src={API + session.videoPath} className="w-full rounded" /> : <div>No video uploaded</div>}
        </CardContent></Card>
      </div>
      <div>
        <Card className="card-shadow p-4">
          <Typography variant="subtitle1">Session Details</Typography>
          <div className="mt-3">
            <div><strong>Started:</strong> {new Date(session.startedAt).toLocaleString()}</div>
            <div><strong>Ended:</strong> {session.endedAt ? new Date(session.endedAt).toLocaleString() : 'In progress'}</div>
            <div className="mt-4">
              <Button variant="contained" onClick={genReport}>Generate Report</Button>
              {report && (<div className="mt-2"><a href={API + report.pdf} target="_blank" className="text-tutedude-700">Download PDF</a><br/><a href={API + report.csv} target="_blank" className="text-tutedude-700">Download CSV</a></div>)}
            </div>
          </div>
        </Card>

        <Card className="card-shadow mt-4 p-4">
          <Typography variant="subtitle2">Live Events</Typography>
          <div style={{maxHeight:300, overflow:'auto', marginTop:8}}>
            {events.length === 0 ? <div className="text-sm text-gray-500">No events yet</div> : events.map((ev, idx) => (
              <div key={idx} className="p-2 border-b">
                <div style={{display:'flex', justifyContent:'space-between'}}><strong>{ev.type}</strong><span style={{fontSize:12, color:'#666'}}>{new Date(ev.timestamp).toLocaleTimeString()}</span></div>
                <div style={{fontSize:12, color:'#444'}}>{JSON.stringify(ev.details||{})}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
