//** Select the complete users table
import { db } from "../../database/db.js";
import { usersTable } from "./invite_user_schema.js";
export const usersData = db
    .select()
    .from(usersTable);
