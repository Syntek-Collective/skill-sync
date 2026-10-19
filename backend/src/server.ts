/*

    SERVER
    A server is a program that runs continuously, waiting to receive requests and send back responses
    This is the entry point that allows the frontend to ask the backend to do things (ie. get data, run operations, access an LLM, etc.)


    WHAT IS THE PURPOSE OF THIS FILE?
    To start the server - it takes the app (from app.ts) and tells it to begin listening 4 requests on port 3000
    This file is the "on switch" that makes the backend run and start listening for frontend requests


*/


import app from './app'

//hosting platforms assign the port through PORT; fall back to 3000 for local dev
const port = Number(process.env.PORT) || 3000

//turn the server on so it waits for people to send it requests
//when it's successfully started, print a message so we know it's working
app.listen(port, () => console.log(`Server is listening on port ${port}`));