import React from 'react';
import Interview from './pages/Interview';
import AdminList from './admin/AdminList';
import AdminSession from './admin/AdminSession';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';

export default function App(){
  return (
    <Router>
      <AppBar position="static" color="transparent" elevation={0} className="backdrop-blur-sm">
        <Toolbar className="max-w-6xl mx-auto w-full">
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, color: '#122144', fontWeight:700 }}>
            Interview Proctoring
          </Typography>
          <nav className="space-x-4">
            <Link to="/" className="text-sm font-medium text-tutedude-700">Interview</Link>
            <Link to="/admin" className="text-sm font-medium text-tutedude-700">Admin</Link>
          </nav>
        </Toolbar>
      </AppBar>
      <Container maxWidth="6xl" className="mt-8">
        <Routes>
          <Route path="/" element={<Interview/>} />
          <Route path="/admin" element={<AdminList/>} />
          <Route path="/admin/session/:id" element={<AdminSession/>} />
        </Routes>
      </Container>
    </Router>
  );
}
