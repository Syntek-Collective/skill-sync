# ROUTES


# What is a route?
A route is an address and instructions for what to do when a request comes to that address = when a request comes [here] do [this]

Each router is like a miniature version of app.ts (traffic-director) but for a specific feature 


# 2 Parts of Every Route 
1. Method - the kind of request (get, post, etc.)
2. Path - the address (e.g. /api/analyze)


# Full Address
Base Path is from app.ts - this is the broad routing by feature that connects the request to the router file

Route Path if from this file - the specific routing that connects to specific handlers/controllers

FULL ADDRESS = base path + route path

Example:
  app.ts:  app.use('/api/auth', authRoutes)   → base = /api/auth
  file:    router.post('/login', login)        → /api/auth + /login = /api/auth/login



# What is a Route Files job?
A route file is like a receptionist, its knows which request(s) came in and what controller should handle them - it does NOT do the work it just directs the request to the right controller that will do the work 



# Importing Express
You import express in every router file in order to access Router() & create the router object 




NOTE: '/' means right at the base, nothing extra (the full path is just the base path itself)

NOTE: The file names have nothing to do with the address - path names and file names are two different things