import React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';

export default function EventFeed({ events }) {
  return (
    <Card className="card-shadow rounded-xl p-4 mb-4 bg-white">
      <Typography variant="h6" className="mb-2 text-tutedude-800">Live Events</Typography>
      <div className="max-h-96 overflow-y-auto space-y-2">
        {events.length === 0 ? (
          <div className="text-sm text-gray-400">No events yet</div>
        ) : events.map((ev, idx) => (
          <div key={idx} className="p-2 border rounded-md bg-gradient-to-r from-pink-50 via-purple-50 to-blue-50">
            <div className="flex justify-between items-center">
              <span className="font-medium text-tutedude-700">{ev.type}</span>
              <span className="text-xs text-gray-500">{new Date(ev.timestamp).toLocaleTimeString()}</span>
            </div>
            <div className="text-xs text-gray-600 mt-1">{JSON.stringify(ev.details || {})}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
