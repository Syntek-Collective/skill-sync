//Builds and configures the Express backend app: enables CORS + JSON parsing,
//mounts the test/history/analyze routes and adds a catch-all error handler 
//then exports it for the server to run.

import express, { Request, Response, NextFunction } from "express";
import historyRouter from './routes/historyRoutes'
import analyzeRouter from './routes/analyzeRoutes'

import cors from 'cors'

//create a new server application and store it so you can use it
//the server object that handles requests
const app = express();

//allowed frontend origins come from CORS_ORIGIN (comma-separated) so the deployed
//frontend can call the API; defaults to the local Vite dev server
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

//the analyze routes can receive a resume PDF inside the JSON body (base64, up to 5 MB of PDF),
//so they get a bigger size limit. This parser runs first; the default one below then skips
//those requests because their body is already parsed.
app.use('/api/analyze', express.json({ limit: '8mb' }));

//every other route keeps Express's small default limit (100 KB)
app.use(express.json());

// TEST ROUTE - WORKING ✅
app.get("/api/test", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// ===== ROUTES (all routes go here, before the error handler) =====
app.use('/api/history', historyRouter);
app.use("/api/analyze", analyzeRouter);

// ===== ERROR HANDLER (must be LAST - after all routes) =====
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  //errors from Express itself carry a status: e.g. the JSON parser throws 413 for a body over the
  //size limit, or 400 for broken JSON. Pass those on so the client sees what actually went wrong.
  const status: number = err.status || err.statusCode || 500;

  if (status < 500) {
    //the frontend shows the "error" field to the user; "message" keeps the original shape
    const message = status === 413 ? 'That file is too large.' : 'The request was invalid.';
    return res.status(status).json({ success: false, message, error: message });
  }

  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

export default app;