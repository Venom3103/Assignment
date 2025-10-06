// src/admin/AdminList.jsx
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { DataGrid } from '@mui/x-data-grid';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';

const API = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

export default function AdminList() {
  const [sessions, setSessions] = useState([]);

  async function load() {
    try {
      const res = await axios.get(API + '/api/sessions');
      setSessions(res.data.sessions || []);
    } catch (e) {
      console.warn(e);
    }
  }

  useEffect(() => { load(); }, []);

  const columns = [
    {
      field: 'candidateName',
      headerName: 'Candidate',
      flex: 1,
      renderCell: (params) => (
        <Link to={`/admin/session/${params.row._id}`} className="text-blue-700 font-semibold">
          {params.value}
        </Link>
      ),
    },
    {
      field: 'startedAt',
      headerName: 'Started At',
      flex: 1,
      valueGetter: ({ value }) => new Date(value).toLocaleString(),
    },
    {
      field: 'endedAt',
      headerName: 'Ended At',
      flex: 1,
      valueGetter: ({ value }) => value ? new Date(value).toLocaleString() : 'In Progress',
    },
    {
      field: 'status',
      headerName: 'Status',
      flex: 0.5,
      renderCell: ({ row }) => (
        <Chip
          label={row.endedAt ? 'Completed' : 'Running'}
          color={row.endedAt ? 'success' : 'warning'}
          size="small"
        />
      ),
    },
  ];

  return (
    <div className="p-4">
      <Typography variant="h5" className="mb-4 text-gray-800">Interview Sessions</Typography>
      <div style={{ height: 500, width: '100%' }}>
        <DataGrid
          rows={sessions}
          getRowId={row => row._id}
          columns={columns}
          pageSize={10}
          rowsPerPageOptions={[10]}
          disableSelectionOnClick
        />
      </div>
    </div>
  );
}
