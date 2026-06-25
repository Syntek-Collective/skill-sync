/*

  SERVER
  A server is a program that runs continuously, waiting to receive requests and send back responses
  This is the entry point that allows the frontend to ask the backend to do things (ie. get data, run operations, access an LLM, etc.)

  app.ts  v.s  server.ts
  server.ts is a on-switch for the server - app.ts builds and configures the app


  EXPRESS
  A tool/library/framework that makes building a backend server much easier by handling low level stuff so you don't have to write from scratch


  WHAT IS THE PURPOSE OF THIS FILE?
  Builds the complete configured backend application that is ready to receive and handle requests


  ROUTES in app.ts
  app.ts uses app.use to connect requests to route files - route files are just a way to organize code by feature and keep the main file clean 

  TWO LEVELS OF ROUTING 
  app.ts sorts by feature (broad) and router files sort by the specific route (which handler)

  For a small application you could skip the route files and do it all directly in this file but as the app grows this becomes less and less feasible

*/


import express, { Request, Response } from "express";

import analyzeRoutes from "./routes/analyzeRoutes";

//create a new server application and store it so you can use it
//the server object that handles requests
const app = express();

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

//connect the analyze feature
app.use("/api/analyze", analyzeRoutes);


export default app;
