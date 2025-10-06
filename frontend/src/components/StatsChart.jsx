import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function StatsChart({ events }) {
  const counts = events.reduce((a, e) => { a[e.type] = (a[e.type] || 0) + 1; return a; }, {});
  const data = Object.entries(counts).map(([k,v]) => ({ name: k, count: v }));

  if(data.length === 0) return <div className="text-gray-500 text-sm">No events to chart</div>;

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
        <XAxis dataKey="name" />
        <YAxis allowDecimals={false}/>
        <Tooltip />
        <Bar dataKey="count" fill="#7C3AED" />
      </BarChart>
    </ResponsiveContainer>
  );
}
