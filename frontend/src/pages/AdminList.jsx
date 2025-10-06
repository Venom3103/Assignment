// frontend/src/pages/AdminList.jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

export default function AdminList(){
  const [sessions, setSessions] = useState([]);
  const [filter, setFilter] = useState('all'); // all | running | completed
  useEffect(()=>{ load(); },[]);
  async function load(){
    try { const res = await axios.get(`${API_BASE}/api/sessions`); setSessions(res.data.sessions || []); } catch(e){ console.warn(e); }
  }
  const filtered = sessions.filter(s => filter==='all' ? true : (filter==='running' ? !s.endedAt : !!s.endedAt));
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Typography variant="h5">Sessions</Typography>
        <div className="flex items-center gap-2">
          <button onClick={()=>setFilter('all')} className={`px-3 py-1 rounded ${filter==='all'?'bg-tutedude-500 text-white':'bg-white'}`}>All</button>
          <button onClick={()=>setFilter('running')} className={`px-3 py-1 rounded ${filter==='running'?'bg-tutedude-500 text-white':'bg-white'}`}>Running</button>
          <button onClick={()=>setFilter('completed')} className={`px-3 py-1 rounded ${filter==='completed'?'bg-tutedude-500 text-white':'bg-white'}`}>Completed</button>
          <button className="px-3 py-1 bg-tutedude-500 text-white rounded" onClick={load}>Refresh</button>
        </div>
      </div>
      <div className="grid gap-3">
        {filtered.length===0 ? <div>No sessions</div> : filtered.map(s => (
          <Card key={s._id} className="card-shadow">
            <CardContent className="flex justify-between items-center">
              <div>
                <Link to={'/admin/session/'+s._id} className="text-tutedude-700 font-semibold">{s.candidateName || 'Candidate'}</Link>
                <div className="text-sm text-gray-500">{new Date(s.startedAt).toLocaleString()}</div>
              </div>
              <div className="text-sm flex items-center gap-3">
                <div>{s.endedAt? new Date(s.endedAt).toLocaleTimeString() : 'In progress'}</div>
                <Chip label={s.endedAt ? 'Completed' : 'Running'} color={s.endedAt ? 'default' : 'success'} size="small"/>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
