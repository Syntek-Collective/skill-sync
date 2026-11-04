/*

    SERVER
    A server is a program that runs continuously, waiting to receive requests and send back responses
    This is the entry point that allows the frontend to ask the backend to do things (ie. get data, run operations, access an LLM, etc.)


    WHAT IS THE PURPOSE OF THIS FILE?
    To start the server - it takes the app (from app.ts) and tells it to begin listening 4 requests on port 3000
    This file is the "on switch" that makes the backend run and start listening for frontend requests

    The same HTTP server also carries the WebSocket at /ws, which streams ranking progress
    (docs/RANKING.md).

*/


import http from 'http'
import app from './app'
import { attachWsServer } from './realtime/wsServer'
import { markInterruptedRunsOnBoot } from './services/rankingStore'

//hosting platforms assign the port through PORT; fall back to 3000 for local dev
const port = Number(process.env.PORT) || 3000

//one HTTP server for both the API (Express) and the WebSocket
const server = http.createServer(app)
attachWsServer(server)

//a private ranking run's resumes only lived in the previous process's memory, so any private run
//that was still going when the server stopped can't finish: mark it interrupted.
//Never throws: without the ranking tables (migration not run yet) it logs one line and the
//rest of the app (analyze, history) keeps working.
void markInterruptedRunsOnBoot()

//turn the server on so it waits for people to send it requests
//when it's successfully started, print a message so we know it's working
server.listen(port, () => console.log(`Server is listening on port ${port}`));
