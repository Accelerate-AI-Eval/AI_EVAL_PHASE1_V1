//** Select the complete organization table
import { db } from "../../database/db.js";
import { createOrganization } from "./createOrganization.js";
export const organizationsData = db
    .select()
    .from(createOrganization);
