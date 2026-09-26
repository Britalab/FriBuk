import { BrowserRouter, Routes, Route } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import ToastProvider from "./components/ToastProvider";

import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Feed from "./pages/Feed";
import StoryDetail from "./pages/StoryDetail";
import ChapterReader from "./pages/ChapterReader";
import CreateStory from "./pages/CreateStory";
import CreateChapter from "./pages/CreateChapter";
import EditStory from "./pages/EditStory";
import EditChapter from "./pages/EditChapter";
import NotFound from "./pages/NotFound";
import Support from "./pages/Support";
import SupportAdmin from "./pages/SupportAdmin";
import Profile from "./pages/Profile";
import PublicProfile from "./pages/PublicProfile";
import Authors from "./pages/Authors";

// Páginas legales
import Terms from "./pages/Terms";
import CommunityRules from "./pages/CommunityRules";
import ContentPolicy from "./pages/ContentPolicy";
import Copyright from "./pages/Copyright";
import Privacy from "./pages/Privacy";
import Moderation from "./pages/Moderation";

import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>

        <Navbar />

        <Routes>
          <Route path="/" element={<Feed />} />

          <Route path="/autores" element={<Authors />} />

          <Route path="/login" element={<Login />} />

          <Route path="/register" element={<Register />} />

          <Route
            path="/create-story"
            element={
              <ProtectedRoute>
                <CreateStory />
              </ProtectedRoute>
            }
          />

          <Route
            path="/stories/:storyId/create-chapter"
            element={
              <ProtectedRoute>
                <CreateChapter />
              </ProtectedRoute>
            }
          />

          <Route
            path="/stories/:storyId/edit"
            element={
              <ProtectedRoute>
                <EditStory />
              </ProtectedRoute>
            }
          />

          <Route
            path="/stories/:storyId"
            element={<StoryDetail />}
          />

          <Route
            path="/stories/:storyId/chapters/:chapterId"
            element={<ChapterReader />}
          />

          <Route
            path="/stories/:storyId/chapters/:chapterId/edit"
            element={
              <ProtectedRoute>
                <EditChapter />
              </ProtectedRoute>
            }
          />

          <Route path="/support" element={<Support />} />

          <Route
            path="/usuario/:userId"
            element={<PublicProfile />}
          />

          <Route
            path="/perfil"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />

          {/* Páginas legales */}
          <Route path="/terminos" element={<Terms />} />
          <Route path="/comunidad" element={<CommunityRules />} />
          <Route path="/contenido" element={<ContentPolicy />} />
          <Route path="/derechos-autor" element={<Copyright />} />
          <Route path="/privacidad" element={<Privacy />} />
          <Route path="/moderacion" element={<Moderation />} />

          <Route path="/support/admin" element={<SupportAdmin />} />

          <Route path="*" element={<NotFound />} />
        </Routes>

        </ToastProvider>

      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
