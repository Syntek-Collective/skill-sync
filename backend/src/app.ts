
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import historyRouter from './routes/historyRoutes';

//create a new server application and store it so you can use it
//the server object that handles requests
const app = express();

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

//configure the application - set the settings and instructions so the app know how to behave
//you're front end sends data as text that isn't readable on the back end
//tells the app we must convert the text to a JavaScript object
app.use(express.json());



//TEST ROUTE - WORKING ✅ 
//add a route - when someone sends a GET request to the address "/api/test"...
app.get("/api/test", (req: Request, res: Response) => {
  //...send back a JSON response saying everything is working
  res.json({ status: "ok" });
});

// Mount routes: Any request starting with /api/history goes here
app.use('/api/history', historyRouter);

// Global error handler: Catch errors passed via next(error)
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack); // Log the error before debugging
  res.status(500).json({success: false, message: 'Internal Server Error'});
});




export default app;
