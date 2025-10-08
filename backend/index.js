require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const PDFDocument = require('pdfkit');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/reports', express.static(path.join(__dirname, 'reports')));

const upload = multer({
  dest: path.join(__dirname, 'uploads/tmp'),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.includes('webm') && !file.mimetype.includes('mp4')) {
      return cb(new Error('Only webm/mp4 allowed'), false);
    }
    cb(null, true);
  }
});


const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/interview_proctoring';
mongoose.connect(MONGO).then(()=>console.log('MongoDB connected ✅')).catch(e=>console.error(e));

const Session = mongoose.model('Session', new mongoose.Schema({
  candidateName: String, startedAt:{type:Date, default:Date.now}, endedAt:Date, videoPath:String
}));
const Event = mongoose.model('Event', new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },
  type: String, timestamp: Date, details: mongoose.Schema.Types.Mixed
}));

io.on('connection', socket => {
  console.log('socket', socket.id);
  socket.on('join', room => socket.join(room));
  socket.on('event', ev => { if(ev && ev.sessionId) io.to(ev.sessionId).emit('event', ev); });
});

app.post('/api/sessions', async (req,res) => {
  const { candidateName } = req.body;
  const s = new Session({ candidateName });
  await s.save();
  res.json({ sessionId: s._id, startedAt: s.startedAt });
});

app.get('/api/sessions', async (req,res) => {
  const sessions = await Session.find().sort({ startedAt:-1 }).lean();
  res.json({ sessions });
});

app.post('/api/events', async (req,res) => {
  const { sessionId, type, timestamp, details } = req.body;
  if(!sessionId) return res.status(400).json({ error:'sessionId required' });
  const e = new Event({ sessionId, type, timestamp: timestamp ? new Date(timestamp) : new Date(), details });
  await e.save();
  io.to(sessionId).emit('event', e);
  res.json({ ok:true });
});

app.get('/api/events/session/:sessionId', async (req,res) => {
  const events = await Event.find({ sessionId: req.params.sessionId }).sort({ timestamp:-1 }).lean();
  res.json({ events });
});

app.post('/api/upload-video', upload.single('video'), async (req,res) => {
  try {
    const { sessionId } = req.body;
    if(!req.file) return res.status(400).json({ error:'no file' });
    const uploadsDir = path.join(__dirname,'uploads');
    if(!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive:true });
    const dest = path.join(uploadsDir, (sessionId||'session') + '.webm');
    fs.renameSync(req.file.path, dest);
    await Session.findByIdAndUpdate(sessionId, { videoPath: '/uploads/' + path.basename(dest), endedAt: new Date() });
    res.json({ ok:true, path: '/uploads/' + path.basename(dest) });
  } catch(e){ console.error(e); res.status(500).json({ error:'upload' }); }
});

app.get('/api/session/:id', async (req,res) => {
  const session = await Session.findById(req.params.id).lean();
  res.json({ session });
});

app.post('/api/generate-report/:sessionId', async (req,res) => {
  try {
    const sessionId = req.params.sessionId;
    const session = await Session.findById(sessionId).lean();
    const events = await Event.find({ sessionId }).sort({ timestamp:1 }).lean();
    const counts = events.reduce((a,e)=>{ a[e.type]=(a[e.type]||0)+1; return a; }, {});
    const score = Math.max(0,100 - (counts.LOOK_AWAY||0)*5 - (counts.NO_FACE||0)*10 - (counts.UNAUTHORIZED_ITEM||0)*15 - (counts.MULTIPLE_FACES||0)*10);
    const reportsDir = path.join(__dirname,'reports'); if(!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir);
    const csvPath = path.join(reportsDir, sessionId + '.csv');
    const csvWriter = createCsvWriter({ path: csvPath, header:[{id:'timestamp',title:'Timestamp'},{id:'type',title:'Event'},{id:'details',title:'Details'}]});
    await csvWriter.writeRecords(events.map(e=>({ timestamp: e.timestamp, type: e.type, details: JSON.stringify(e.details||{}) })));
    const pdfPath = path.join(reportsDir, sessionId + '.pdf');
    const doc = new PDFDocument(); doc.pipe(fs.createWriteStream(pdfPath));
    doc.fontSize(18).text('Proctoring Report', { align:'center' }); doc.moveDown();
    doc.fontSize(12).text(`Candidate: ${session.candidateName || 'N/A'}`); doc.text(`Session ID: ${session._id}`); doc.text(`Started At: ${session.startedAt}`); doc.text(`Ended At: ${session.endedAt}`);
    doc.moveDown(); doc.text('Summary:'); Object.entries(counts).forEach(([k,v])=> doc.text(`- ${k}: ${v}`)); doc.moveDown(); doc.text(`Integrity Score: ${score}/100`); doc.moveDown(); doc.text('Event Log:'); events.forEach(ev => doc.text(`${new Date(ev.timestamp).toLocaleString()} — ${ev.type} — ${JSON.stringify(ev.details||{})}`));
    doc.end();
    res.json({ ok:true, csv: '/reports/' + path.basename(csvPath), pdf: '/reports/' + path.basename(pdfPath) });
  } catch(e){ console.error(e); res.status(500).json({ error:'gen' }); }
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, ()=> console.log('listening', PORT));
