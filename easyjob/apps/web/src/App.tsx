import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import AnalyticsPage from "./pages/AnalyticsPage";
import CvUploadPage from "./pages/CvUploadPage";
import JobDetailPage from "./pages/JobDetailPage";
import JobsPage from "./pages/JobsPage";
import MatchReportPage from "./pages/MatchReportPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <JobsPage /> },
      { path: "jobs/:id", element: <JobDetailPage /> },
      { path: "cv", element: <CvUploadPage /> },
      { path: "match/:jobId", element: <MatchReportPage /> },
      { path: "analytics", element: <AnalyticsPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
