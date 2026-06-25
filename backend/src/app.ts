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

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

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
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

export default app;