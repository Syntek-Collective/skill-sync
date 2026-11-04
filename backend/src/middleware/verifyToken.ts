//Verifies a Supabase access token and returns the user it belongs to.
//Shared by the HTTP authMiddleware and the WebSocket auth handshake, so both check logins the same way.
import "dotenv/config";
import { createClient, type User } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseKey);

//Ask Supabase Auth if this token belongs to a real logged-in user.
//Returns the user, or null if the token is missing, expired or rejected.
export async function verifyAccessToken(token: string): Promise<User | null> {
    if (!token) return null;

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) return null;

    return data.user;
}
