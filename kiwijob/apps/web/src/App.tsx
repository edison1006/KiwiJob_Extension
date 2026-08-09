import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { RouterProvider } from "react-router/dom";
import { AppLayout } from "./layouts/AppLayout";
import AuthPage from "./pages/AuthPage";

const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const BrowseJobsPage = lazy(() => import("./pages/BrowseJobsPage"));
const CvUploadPage = lazy(() => import("./pages/CvUploadPage"));
const CvOptimizerPage = lazy(() => import("./pages/CvOptimizerPage"));
const HomePage = lazy(() => import("./pages/HomePage"));
const ForumPage = lazy(() => import("./pages/ForumPage"));
const InterviewAssistantPage = lazy(() => import("./pages/InterviewAssistantPage"));
const JobDetailPage = lazy(() => import("./pages/JobDetailPage"));
const JobsPage = lazy(() => import("./pages/JobsPage"));
const MatchReportPage = lazy(() => import("./pages/MatchReportPage"));
const MembershipPage = lazy(() => import("./pages/MembershipPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const ServicesPage = lazy(() => import("./pages/ServicesPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));

const router = createBrowserRouter([
  { path: "/login", element: <AuthPage /> },
  { path: "/privacy", element: <PrivacyPage /> },
  { path: "/terms", element: <TermsPage /> },
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "tracker", element: <JobsPage /> },
      { path: "jobs/:id", element: <JobDetailPage /> },
      { path: "matches", element: <JobsPage /> },
      { path: "browse", element: <BrowseJobsPage /> },
      { path: "documents", element: <CvUploadPage /> },
      { path: "cv-optimizer", element: <CvOptimizerPage /> },
      { path: "cv", element: <Navigate to="/documents" replace /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "services", element: <ServicesPage /> },
      { path: "interview-assistant", element: <InterviewAssistantPage /> },
      { path: "community", element: <ForumPage /> },
      { path: "premium", element: <MembershipPage /> },
      { path: "membership", element: <Navigate to="/premium" replace /> },
      { path: "match/:jobId", element: <MatchReportPage /> },
      { path: "analytics", element: <AnalyticsPage /> },
    ],
  },
]);

export default function App() {
  return (
    <Suspense fallback={<div className="p-8 text-sm font-medium text-slate-600">Loading KiwiJob…</div>}>
      <RouterProvider router={router} />
    </Suspense>
  );
}
