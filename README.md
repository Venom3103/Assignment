# Interview Proctoring App

This package contains a **demo Interview Proctoring app** with a polished UI using **Tailwind CSS** and **Material UI**, ready for local testing. The app uses **TensorFlow.js** models to monitor candidates in real-time during online interviews and detects misconduct events automatically.

---

## Features

- **Live Video Monitoring**  
  Stream the candidate's camera feed directly in the browser with real-time overlays for face landmarks and detected objects.

- **Face Tracking & Focus Detection**  
  Detects if the candidate is looking away, no face is present, or multiple faces appear in the frame.

- **Unauthorized Object Detection**  
  Uses CocoSSD to detect phones, books, papers, laptops, tablets, etc. — automatically flags misconduct.

- **Automatic Session Termination**  
  The interview ends immediately if any misconduct (look-away, multiple faces, unauthorized items) is detected.

- **Video Recording & Upload**  
  Records the candidate's session and uploads the video to the backend automatically at the end.

- **Live Event Feed**  
  Displays real-time events like session start, session end, misconduct, and uploads in a live feed panel.

- **Report Generation**  
  Generates PDF and CSV reports for each session including all detected events and integrity scores.

---

## Tech Stack

- **Frontend:** React, Tailwind CSS, Material UI  
- **Backend:** Node.js + Express (API endpoints for sessions, events, video uploads)  
- **Database:** MongoDB (sessions & events)  
- **Real-time Communication:** Socket.io  
- **AI Models:** TensorFlow.js  
  - `@tensorflow-models/face-landmarks-detection` (FaceMesh)  
  - `@tensorflow-models/coco-ssd` (Object Detection)  
- **Video Recording:** MediaRecorder API  

---

## Deployment Links

- **Frontend (Live):** [https://my-assignment-tutedude.vercel.app/](https://my-assignment-tutedude.vercel.app/)  
- **Backend (Live API):** [https://assignment-4c22.onrender.com)](https://assignment-4c22.onrender.com)  

> Make sure your frontend `.env` points to the deployed backend:
```bash
VITE_API_BASE=https://interview-proctoring-backend.onrender.com
```

## Installation

1. Clone the repository:

```bash
git clone https://github.com/Venom3103/Assignment.git
cd Assignment/frontend
cd Assignment/backend
```
2. Install dependencies:

```bash
npm install
```

3. Create a .env file :
   
Frontend (frontend/.env)
```bash
VITE_API_BASE=http://localhost:4000
``` 

Backend (backend/.env)
```bash
PORT=4000
MONGO_URI=<your_mongodb_uri>
CORS_ORIGIN=http://localhost:5173
```
4. Start the Frontend
```bash
npm run dev
```

Start Backend:
```bash
cd backend
npm install
```

5. Open http://localhost:5173
in your browser.

## Usage

1. Open the frontend in your browser.

2. Click Start Interview once the AI models have loaded.

3. The system monitors the candidate for:

- Looking away for >5 seconds

- No face detected for >10 seconds

- Multiple faces in the frame

- Unauthorized items (phone, books, laptop, tablet, papers)

4. Misconduct triggers automatic session termination.

5. You can manually end the interview.

6. Admin can generate PDF/CSV reports of each session, showing:

- Candidate Name

- Interview Duration

- Number of focus lost events

- Suspicious events (multiple faces, absence, unauthorized items)

- Final Integrity Score

## Future Improvements

- Reduce CPU load by optimizing face/object detection intervals
- Add audio proctoring for background voice detection
- Integrate role-based question management for adaptive interviews
- Real-time analytics dashboard for interviewers
