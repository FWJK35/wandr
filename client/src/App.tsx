import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Home from './pages/consumer/Home';
import Explore from './pages/consumer/Explore';
import Profile from './pages/consumer/Profile';
import Quests from './pages/consumer/Quests';
import Feed from './pages/consumer/Feed';
import Rewards from './pages/consumer/Rewards';
import Login from './pages/Login';
import Register from './pages/Register';
import BusinessDashboard from './pages/business/Dashboard';
import Layout from './components/shared/Layout';
import GeometryEditor from './pages/tools/GeometryEditor';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-dark-300">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Protected consumer routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Home />} />
        <Route path="explore" element={<Explore />} />
        <Route path="quests" element={<Quests />} />
        <Route path="feed" element={<Feed />} />
        <Route path="rewards" element={<Rewards />} />
        <Route path="profile" element={<Profile />} />
        <Route path="profile/:userId" element={<Profile />} />
        <Route path="tools/geometry" element={<GeometryEditor />} />
      </Route>

      {/* Business dashboard */}
      <Route
        path="/business/*"
        element={
          <ProtectedRoute>
            <BusinessDashboard />
          </ProtectedRoute>
        }
      />

      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
