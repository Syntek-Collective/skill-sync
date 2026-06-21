/*

    What feature is it for?
    Handles all the auth feature's routes (anything to do with logging in and signing up).
    A mini routing system just for this file's routes.

    What does this route do? What request does it handle?
    This router receives all the auth-related requests and directs them to the right 
    controller (which does the actual work). It creates a mini-router for the auth 
    routes, defines them, and exports the router so app.ts can connect it.


    Base Route from app.ts
    /api/auth 

*/

/*

    TODO
    wire up the auth route(s) once the authController exists.

    This file still needs to:
    1. import the controller function(s) this route should point to
    2. define the route(s) - decide the method (GET/POST) and path
        (this feature SENDS user credentials - consider which method fits, 
         and note there may be MORE than one route here, e.g. login and signup)
    3. make sure each route points to the right controller function

    Coordinate with whoever owns the authController on the function name(s)
    so the imports match.

*/


//import express in order to create the router
import express from 'express'

//create the router 
const router = express.Router()





//export the router so app.ts can connect to it 
export default router