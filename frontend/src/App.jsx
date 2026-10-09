import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import ToastProvider from "./components/ToastProvider";
import NotificationsProvider from "./components/NotificationsProvider";

import Navbar from "./components/Navbar";
import UpdateNotice from "./components/UpdateNotice";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
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
import ReadingListDetail from "./pages/ReadingListDetail";
import ProfileCustomize from "./pages/ProfileCustomize";
import Activity from "./pages/Activity";
import Messages from "./pages/Messages";
import Authors from "./pages/Authors";
import Forum from "./pages/Forum";
import ForumTopic from "./pages/ForumTopic";
import ForumNewTopic from "./pages/ForumNewTopic";

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
        <NotificationsProvider>

        <Navbar />
        <UpdateNotice />

        <Routes>
          <Route path="/" element={<Feed />} />

          <Route path="/autores" element={<Authors />} />

          <Route path="/login" element={<Login />} />

          <Route path="/register" element={<Register />} />

          <Route path="/recuperar" element={<ForgotPassword />} />

          <Route path="/restablecer" element={<ResetPassword />} />

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
          <Route path="/forum" element={<Forum />} />
          <Route path="/forum/:topicId" element={<ForumTopic />} />
          <Route path="/forum/new" element={<ForumNewTopic />} />
          
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
            path="/listas/:listId"
            element={<ReadingListDetail />}
          />

          <Route
            path="/perfil"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />

          <Route
            path="/perfil/personalizar"
            element={
              <ProtectedRoute>
                <ProfileCustomize />
              </ProtectedRoute>
            }
          />

          <Route
            path="/actividad"
            element={
              <ProtectedRoute>
                <Activity />
              </ProtectedRoute>
            }
          />

          <Route
            path="/mensajes"
            element={
              <ProtectedRoute>
                <Messages view="inbox" />
              </ProtectedRoute>
            }
          />

          <Route
            path="/mensajes/privados/:userId"
            element={
              <ProtectedRoute>
                <Messages view="private" />
              </ProtectedRoute>
            }
          />

          <Route
            path="/mensajes/autores/:authorId"
            element={
              <ProtectedRoute>
                <Messages view="author" />
              </ProtectedRoute>
            }
          />

          <Route
            path="/mensajes/ajustes"
            element={
              <ProtectedRoute>
                <Messages view="settings" />
              </ProtectedRoute>
            }
          />

          {/* La dirección anterior lleva al centro de actividad. */}
          <Route
            path="/notificaciones"
            element={<Navigate to="/actividad" replace />}
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

        </NotificationsProvider>
        </ToastProvider>

      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
