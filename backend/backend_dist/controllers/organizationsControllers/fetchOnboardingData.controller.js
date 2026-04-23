import { organizationsData } from "../../schema/organizations/selectOrganization.js";
//** Fetch onboarding Details and send it to frontend(client) side
const fetchOrganizations = async (req, res) => {
    try {
        const organizations = await organizationsData;
        res.status(200).json({
            message: "Organizations fetched successfully",
            data: organizations,
        });
    }
    catch (error) {
        console.error("Error in fetchOrganizations:", error instanceof Error ? error.message : String(error));
        res.status(500).json({ error: "Internal server error" });
    }
};
export default fetchOrganizations;
