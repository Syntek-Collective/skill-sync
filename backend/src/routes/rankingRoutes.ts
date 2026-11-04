/*

    What feature is it for?
    Pairwise ranking runs (docs/RANKING.md). Progress streams over the WebSocket at /ws.

    Base Route from app.ts
    /api/rankings

    Auth: app.ts runs authMiddleware for /api/rankings BEFORE the large JSON parser, so an
    unauthenticated request is rejected without its body being read. This router is only
    mounted there, so it doesn't run authMiddleware again.

*/

import express from 'express'
import {
  createRankingController,
  deleteRankingController,
  getRankingController,
  resumeRankingController,
} from '../controllers/rankingController'

const rankingRouter = express.Router()

//start a run (it continues in the background) -> 201 { runId, totalTasks }
rankingRouter.post('/', createRankingController)

//a run's status and the last event seq, for this user's runs only
rankingRouter.get('/:runId', getRankingController)

//delete a finished run and its events (owner only) -> 204
rankingRouter.delete('/:runId', deleteRankingController)

//continue a saved run that stopped (restart or OpenAI error); needs the OpenAI key again
rankingRouter.post('/:runId/resume', resumeRankingController)

export default rankingRouter
