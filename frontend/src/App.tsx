import "./App.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Login from "./Components/Authentication/Login/Login";
import ForgotPassword from "./Components/Authentication/ForgotPassword/ForgotPassword";
import ResetPassword from "./Components/Authentication/ResetPassword/ResetPassword";
import MainLayout from "./Components/layout/MainLayout";
import Home from "./Components/pages/Home/Home";
import Dashboard from "./Components/pages/Dashboard/Dashboard";
import Assessments from "./Components/pages/Assessments/Assessments";
import VendorDirectory from "./Components/pages/VendorDirectory/VendorDirectory";
import Compilance from "./Components/pages/SecurityCenter/Compilance";
import Goverance from "./Components/pages/Goverance/Goverance";
import { SalesEnablement } from "./Components/pages/SalesEnablement/SalesEnablement";
import EvidenceLibrary from "./Components/pages/EvidenceLibrary/EvidenceLibrary";
import UserManagement from "./Components/pages/UserManagement/UserManagement";
import MyAccount from "./Components/pages/MyAccount/MyAccount";
import { DirectoryListing } from "./Components/pages/DirectoryListing/DirectoryListing";
import Reports from "./Components/pages/Reports/Reports";
import ReportDetail from "./Components/pages/Reports/ReportDetail";
import GeneralReportDetail from "./Components/pages/Reports/GeneralReportDetail";
import MyVendors from "./Components/pages/MyVendors/MyVendors";
import Organizations from "./Components/pages/Organizations/Organizations";
import OrganizationAssessmentView from "./Components/pages/Organizations/OrganizationAssessmentView";
import Toaster from "./Components/Toaster/Toaster";
import LayoutWithoutNav from "./Components/layout/LayoutWithoutNav";
import VendorMainForm from "./Components/pages/VendorOnboarding/VendorMainForm";
import Onboarding from "./Components/pages/OnBoarding/Onboarding";
import BuyerMainForm from "./Components/pages/BuyerOnboarding/BuyerMainForm";
import SignUp from "./Components/Authentication/SignUp/SignUp";
import PageNotFound from "./Components/PageNotFound/PageNotFound";
import AccessDenied from "./Components/AccessDenied/AccessDenied";
import { AuthGuard, RBACGuard } from "./guards";
import OnboardingAccess from "./utils/OnboardingVerify";
import VendorAttestationsMainForm from "./Components/pages/VendorAttestations/VendorAttestationsMainForm";
import VendorCOTSMain from "./Components/pages/Assessments/VendorCOTS/VendorCOTSMain";
import VendorAttestationDetails from "./Components/pages/VendorAttestationDetails/VendorAttestationDetails";
import BuyerAssessment from "./Components/pages/Assessments/BuyerAssessment/BuyerAssessment";
import BuyerVendorRiskReport from "./Components/pages/Assessments/BuyerAssessment/BuyerVendorRiskReport";
import VendorSelfAttestationLayout from "./Components/layout/VendorSelfAttestationLayout";

function App() {
  return (
    <>
      <Toaster />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/pageNotFound" element={<PageNotFound />} />
          <Route path="/forgotPassword" element={<ForgotPassword />} />
          <Route path="/resetPassword" element={<ResetPassword />} />
          <Route path="/signup/:token" element={<SignUp />} />
          <Route path="/vendorSelfAttestation" element={<VendorSelfAttestationLayout />}>
            <Route index element={<VendorAttestationsMainForm />} />
            <Route path=":token" element={<VendorAttestationsMainForm />} />
          </Route>
          <Route element={<AuthGuard />}>
            <Route path="/accessDenied" element={<AccessDenied />} />
            <Route element={<RBACGuard />}>
              <Route element={<MainLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/organizations" element={<Organizations />} />
                <Route path="/organizations/assessment/:assessmentId" element={<OrganizationAssessmentView />} />
                <Route path="/assessments" element={<Assessments />} />
                <Route path="/vendorcots/:assessmentId" element={<VendorCOTSMain />} />
                <Route path="/vendorcots" element={<VendorCOTSMain />} />
                <Route path="/buyerAssessment/:id" element={<BuyerAssessment />} />
                <Route path="/buyerAssessment" element={<BuyerAssessment />} />
                <Route
                  path="/buyer-vendor-risk-report/:assessmentId"
                  element={<BuyerVendorRiskReport />}
                />
                <Route path="/vendor-directory" element={<VendorDirectory />} />
                <Route path="/riskMappings" element={<MyVendors />} />
                <Route path="/security_center" element={<Compilance />} />
                <Route path="/governance" element={<Goverance />} />
                <Route path="/salesEnablement" element={<SalesEnablement />} />
                <Route path="/evidence-library" element={<EvidenceLibrary />} />
                <Route
                  path="/product_profile"
                  element={<DirectoryListing />}
                />
                <Route path="/reports" element={<Reports />} />
                <Route path="/reports/general/:reportId" element={<GeneralReportDetail />} />
                <Route path="/reports/:reportId" element={<ReportDetail />} />
                <Route
                  path="/attestation_details"
                  element={<VendorAttestationDetails />}
                />
                <Route path="/userManagement" element={<UserManagement />} />
                <Route path="/account" element={<MyAccount />} />
                <Route path="*" element={<Navigate to="/pageNotFound" replace />} />
              </Route>
            </Route>
          </Route>

          {/* This Routing layout is for Vendor and Buyer onboarding without the side navigation bar  */}
          {/* <Route element={<OnboardingAccess />}> */}
          <Route element={<LayoutWithoutNav />}>
            <Route path="/onBoarding/:token" element={<Onboarding />} />
            <Route
              path="/onBoarding/vendorOnboarding/:token"
              element={<VendorMainForm type="vendor" />}
            />
            <Route
              path="/onBoarding/buyerOnboarding/:token"
              element={<BuyerMainForm type="buyer" />}
            />
            <Route path="/vendorcots" element={<VendorCOTSMain />} />
            <Route element={<AuthGuard />}>
              <Route element={<RBACGuard />}>
                <Route path="/buyerAssessment" element={<BuyerAssessment />} />
              </Route>
            </Route>
            <Route path="/buyerAssessment" element={<BuyerAssessment />} />
          </Route>
          {/* </Route> */}
          <Route path="*" element={<Navigate to="/pageNotFound" replace />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
