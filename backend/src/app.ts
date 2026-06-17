import express, { Request, Response } from "express";

//creates the server object that handles requests
const app = express();

//you're front end sends data as text that isn't readable on the back end
//we must convert the text to a JavaScript object
app.use(express.json());

//TEST ROUTE
//when someone sends a GET request to the address "/api/test"...
app.get("/api/test", (req: Request, res: Response) => {
  //...send back a JSON response saying everything is working
  res.json({ status: "ok" });
});

export default app;
