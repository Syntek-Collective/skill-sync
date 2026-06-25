/*

    What feature is it for?
    Handles all the history feature's routes (anything to do with viewing past analyses).
    A mini routing system just for this file's routes.

    What does this route do? What request does it handle?
    This router receives all the history-related requests and directs them to the right 
    controller (which does the actual work). It creates a mini-router for the history 
    routes, defines them, and exports the router so app.ts can connect it.


    Base Route from app.ts
    /api/history 

*/

/*

    TODO
    wire up the history route(s) once the historyController exists.

    This file still needs to:
    1. import the controller function(s) this route should point to
    2. define the route(s) - decide the method (GET/POST) and path
        (this feature mostly RETRIEVES past analyses - consider which method fits)
    3. make sure each route points to the right controller function

    Coordinate with whoever owns the historyController on the function name(s)
    so the imports match.

*/


//import express in order to create the router
import express from 'express'
import getHistory from '../controllers/historyController'

//create the router 
const historyRouter = express.Router()

// Define the route: We use GET because we are retrieving data
historyRouter.get('/', getHistory);





//export the router so app.ts can connect to it 
export default historyRouter