import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { RequireAuth } from "./auth";
import { AppLayout } from "./layouts/AppLayout";
import AnalyticsPage from "./pages/AnalyticsPage";
import AuthPage from "./pages/AuthPage";
import BrowseJobsPage from "./pages/BrowseJobsPage";
import CvUploadPage from "./pages/CvUploadPage";
import HomePage from "./pages/HomePage";
import InterviewAssistantPage from "./pages/InterviewAssistantPage";
import JobDetailPage from "./pages/JobDetailPage";
import JobsPage from "./pages/JobsPage";
import MatchReportPage from "./pages/MatchReportPage";
import MembershipPage from "./pages/MembershipPage";
import PrivacyPage from "./pages/PrivacyPage";
import ServicesPage from "./pages/ServicesPage";
import SettingsPage from "./pages/SettingsPage";

const router = createBrowserRouter([
  { path: "/login", element: <AuthPage /> },
  { path: "/privacy", element: <PrivacyPage /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: "tracker", element: <JobsPage /> },
      { path: "jobs/:id", element: <JobDetailPage /> },
      { path: "matches", element: <JobsPage /> },
      { path: "browse", element: <BrowseJobsPage /> },
      { path: "documents", element: <CvUploadPage /> },
      { path: "cv", element: <Navigate to="/documents" replace /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "services", element: <ServicesPage /> },
      { path: "interview-assistant", element: <InterviewAssistantPage /> },
      { path: "premium", element: <MembershipPage /> },
      { path: "membership", element: <Navigate to="/premium" replace /> },
      { path: "match/:jobId", element: <MatchReportPage /> },
      { path: "analytics", element: <AnalyticsPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
