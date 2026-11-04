/*

    What feature is it for?
    The counterfactual bias audit (docs/RANKING.md).

    Base Route from app.ts
    /api/bias-audit

    Auth: app.ts runs authMiddleware for /api/bias-audit BEFORE the large JSON parser (so an
    unauthenticated request is rejected without its body being read); not repeated here.

*/

import express from 'express'
import biasAuditController from '../controllers/biasAuditController'

const biasAuditRouter = express.Router()

biasAuditRouter.post('/', biasAuditController)

export default biasAuditRouter
