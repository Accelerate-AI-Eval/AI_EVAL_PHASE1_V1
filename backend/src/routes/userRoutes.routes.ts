import express from "express";
import { inviteUser, reinviteUser, resendOnboardingLink } from "../controllers/user_managemnt_controller/user.js";
import userSignup from "../controllers/user_managemnt_controller/signup.js";
import userTokenVerify from "../middlewares/user_management/userTokenVerify.js";
import userLogin from "../controllers/user_managemnt_controller/login.js";
import getMe from "../controllers/user_managemnt_controller/getUser.js";
import updateMyProfile from "../controllers/user_managemnt_controller/updateMyProfile.js";
import fetchAllUsers from "../controllers/user_managemnt_controller/allUsers.usermanagement.js";
import signupAccess from "../middlewares/user_management/signup.middleware.js";
import authenticateToken from "../middlewares/routesProtection.js";
import updatesUsers from "../controllers/user_managemnt_controller/updateUsers.controllers.js";
import forgotPassword from "../controllers/user_managemnt_controller/forgotPassword.js";
import resetPassword from "../controllers/user_managemnt_controller/resetPassword.js";
import getOnboardingAccessStatus from "../controllers/onboarding/getOnboardingAccessStatus.controller.js";

const router = express.Router();

router
.get("/onboarding/access-status", getOnboardingAccessStatus)
.get("/me", authenticateToken, getMe)
.put("/me", authenticateToken, updateMyProfile)
.get("/allUsers",authenticateToken, fetchAllUsers)
.post("/invite_user", authenticateToken, inviteUser)
.post("/reinvite_user/:id", authenticateToken, reinviteUser)
.post("/resend_onboarding/:id", authenticateToken, resendOnboardingLink)
.post("/signupData/:token", userTokenVerify, signupAccess, userSignup)
.post("/login", userLogin)
.post("/forgotPassword", forgotPassword)
.post("/resetPassword", resetPassword)
.put("/updateUser/:id",authenticateToken,updatesUsers)

.post("/logout", authenticateToken, (req, res) => {
    // console.log("eeee", res);
  return res.json({ Logout: true });
});

export default router;
