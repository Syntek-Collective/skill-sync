/*

    What feature is it for?
    Handles the history feature - showing the user their past analyses.

    What does this controller do?
    This is the "doer" for history. The history routes direct requests here, and this 
    controller handles them: reads the request, fetches the user's past analyses from the 
    database, and sends them back.

    The flow:
    Receive → Do the work (call the services) → Respond

    (see controllers/README for how controllers work in general)

*/

/*

    TODO
    build out the history handler(s).

    This file still needs to:
    1. pull whatever it needs out of the request (which user? - so we fetch THEIR history)
    2. use the service to fetch the user's past analyses from the database (supabaseService)
    3. send the list of past analyses back to the frontend
    4. handle the case where there's no history yet, or the fetch fails

    Coordinate with the team on:
    - how we know WHICH user's history to fetch (user id from the session/token?)
    - what each history item should include (id, jobListing, result, createdAt?) - this has 
      to match what the frontend's HistoryModal expects
    - whether analyses get SAVED to history in the analyze flow or somewhere else

*/

import {Request, Response, NextFunction} from 'express';
import {deleteSavedJob, getAnalysesForUser} from '../services/supabaseService';

const getHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Extract userId (Ensure authMiddleware attaches it correctly)
        //authMiddleware stores the verified user on res.locals (not on req), so read it from there
        const userId: string = res.locals.user.id;

        // Fetch the data
        const analyses = await getAnalysesForUser(userId);

        // Send the successful response
        res.status(200).json({success: true, data: analyses});

    } catch (error) {
        // Pass the error to the Express global error handler
        next(error)
    }
}

export default getHistory;

//DELETE /api/history/:jobPostingId
//Deletes one of the user's saved jobs and everything saved with it (results + resume files).
//Only the signed-in user's own jobs can be deleted; anything else is a 404.
export const deleteJobController = async (req: Request, res: Response) => {
    //the user comes from the token authMiddleware verified
    const userId: string = res.locals.user.id;
    const { jobPostingId } = req.params;

    if (typeof jobPostingId !== 'string' || !jobPostingId) {
        return res.status(400).json({ error: "jobPostingId is required." });
    }

    try {
        const deleted = await deleteSavedJob(jobPostingId, userId);
        if (!deleted) {
            return res.status(404).json({ error: "Job not found." });
        }
        //204 = done, nothing to send back
        res.status(204).end();
    } catch (error) {
        console.error("Delete job failed:", error);
        res.status(500).json({ error: "Couldn't delete this job. Please try again." });
    }
}
