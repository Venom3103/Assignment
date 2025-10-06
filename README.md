# Interview Proctoring 

This package contains a **demo Interview Proctoring app** with a polished UI using **Tailwind CSS** and **Material UI**, ready for local testing. The app uses **TensorFlow.js** models to monitor candidates in real-time during online interviews and detects misconduct events automatically.

---

## Features

- **Live Video Monitoring**  
  Stream the candidate's camera feed directly in the browser with real-time overlays for face landmarks and detected objects.

- **Face Tracking & Focus Detection**  
  Detects if the candidate is looking away or if multiple faces appear in the frame.

- **Unauthorized Object Detection**  
  Uses CocoSSD to detect phones, books, papers, laptops, tablets, etc. — automatically flags misconduct.

- **Automatic Session Termination**  
  The interview ends immediately if any misconduct (look-away, multiple faces, unauthorized items) is detected.

- **Video Recording & Upload**  
  Records the candidate's session and uploads the video to the backend automatically at the end.

- **Live Event Feed**  
  Displays real-time events like session start, session end, misconduct, and uploads in a live feed panel.

- **Report Generation**  
  Generates PDF and CSV reports for each session including all detected events.

---

## Tech Stack

- **Frontend:** React, Tailwind CSS, Material UI  
- **Backend:** Node.js + Express (API endpoints for sessions, events, video uploads)  
- **Real-time Communication:** Socket.io  
- **AI Models:** TensorFlow.js, `@tensorflow-models/face-landmarks-detection` (FaceMesh), `@tensorflow-models/coco-ssd` (Object Detection)  
- **Video Recording:** MediaRecorder API

---

## Installation

1. Clone the repository:

```bash
git clone https://github.com/Venom3103/Interview-Proctoring.git
cd Interview-Proctoring/frontend
```
2. Install dependencies:

```bash
npm install
```

3. Create a .env file in frontend with the following:

```bash
VITE_API_BASE=http://localhost:4000
```
4. Start the Frontend
```bash
npm run dev
```
5. Make sure the backend server is running at VITE_API_BASE.

## Usage

1. Open the frontend in your browser.

2. Click Start Interview once the models are loaded.

3. The system will monitor the candidate for:

- Looking away for too long
- Multiple faces in the frame
- Unauthorized items like phone, books, or laptop

4. If any misconduct is detected, the interview will automatically end.

5. You can manually end the interview or generate a report for analysis.

## Future Improvements

- Reduce CPU load by optimizing face/object detection intervals
- Add voice proctoring and audio analysis
- Integrate role-based question management for adaptive interviews
- Real-time analytics dashboard for interviewers
