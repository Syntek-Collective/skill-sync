import app from './app'

//turn the server on so it waits for people to send it requests, at door number 3000
//when it's successfully started, print a message so we know it's working
app.listen(3000, () => console.log('Server is listening on port 3000'));