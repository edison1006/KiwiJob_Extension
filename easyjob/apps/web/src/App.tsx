import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import AnalyticsPage from "./pages/AnalyticsPage";
import BrowseJobsPage from "./pages/BrowseJobsPage";
import CvUploadPage from "./pages/CvUploadPage";
import HomePage from "./pages/HomePage";
import JobDetailPage from "./pages/JobDetailPage";
import JobsPage from "./pages/JobsPage";
import MatchReportPage from "./pages/MatchReportPage";
import ServicesPage from "./pages/ServicesPage";
import SettingsPage from "./pages/SettingsPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "tracker", element: <JobsPage /> },
      { path: "matches", element: <JobsPage /> },
      { path: "browse", element: <BrowseJobsPage /> },
      { path: "documents", element: <CvUploadPage /> },
      { path: "cv", element: <Navigate to="/documents" replace /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "services", element: <ServicesPage /> },
      { path: "match/:jobId", element: <MatchReportPage /> },
      { path: "analytics", element: <AnalyticsPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
