import "dotenv/config";
import { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseKey);

//Checks whether the request has a valid Supabase login token.
export async function authMiddleware(
    req: Request, 
    res: Response, 
    next: NextFunction
) {
    //The frontend should send the Supabase access token in this header:
    //Authorization: Bearer <token>
    const authHeader = req.headers.authorization;

    //If there is no Authorization header, the backend does not know who this is.
    if (!authHeader) {
        return res.status(401).json({
            error: "Missing authentication header",
        })
    }

    // The header should look like: "Bearer abc123".
    if (!authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Invalid authorization header",
        });
    }

    //Remove "Bearer" so we are left with only the token.
    const token = authHeader.replace("Bearer ", "").trim();


    if (!token) {
        return res.status(401).json({
            error: "Missing authentication token",
        });
    }

    //Ask Supabase Auth if this token belongs to a real long-in user.
    const { data, error } = await supabase.auth.getUser(token);

    //If Supabase rejects the token, stop the request.
    if (error || !data.user) {
        return res.status(401).json({
            error: "Unauthorized",
        });
    }

    //Save the verified user where the controller can access it later.
    res.locals.user = data.user;

    next();
}


