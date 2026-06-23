/*

    What feature is it for?
    Handles all the resume features's routes (anything to do with uploading/handling resumes)
    A mini routing system just for this file's routes

    What does this route do? What request does it handle?
    This router receives all the resume-related requests and directs them to the right controller (which does the actual work)
    The file creates a mini-router for the resume routes, defines routes and exports the router so it can be used by app.ts

    Base Route
    /api/resume

*/

/*

    TODO
    wire up the resume route(s) once the resumeController exists.

    This file still needs to:
    1. import the controller function(s) this route should point to
    2. define the route(s) - decide the method (GET/POST) and path
        (consider what the resume feature needs to do - sending a file up? 
         fetching one back? - and which method fits each)
    3. make sure each route points to the right controller function

    Coordinate with whoever owns the resumeController on the function name(s)
    so the imports match.

*/



//import express in order to create the router
import express from 'express'

//create the router 
const router = express.Router()





//export the router so app.ts can connect to it 
export default router