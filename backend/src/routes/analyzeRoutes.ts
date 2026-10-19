/*

    What feature is it for?
    Handles all the analyze feature's routes (anything to do with comparing the resume to a job posting).
    A mini routing system just for this file's routes.

    What does this route do? What request does it handle?
    This router receives all the analyze-related requests and directs them to the right 
    controller (which does the actual work). It creates a mini-router for the analyze 
    routes, defines them, and exports the router so app.ts can connect it.


    Base Route from app.ts
    /api/analyze 

*/



//import express in order to create the router
import express from 'express'
import analyzeController, { requirementsController } from '../controllers/analyzeController'
import { authMiddleware } from '../middleware/authMiddleware'

//create the router 
const analyzeRouter = express.Router()

//step 1 (once per job): extract the job's requirement list
analyzeRouter.post('/requirements', authMiddleware, requirementsController)

//step 2 (once per resume): match one resume against that list
analyzeRouter.post('/', authMiddleware, analyzeController)


//export the router so app.ts can connect to it 
export default analyzeRouter 