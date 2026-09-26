import { createContext, useContext, useState, useEffect } from "react";
import api from "../api/client";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token) {
      api
        .get("/me")
        .then((response) => setUser(response.data.user))
        .catch(() => {
          localStorage.removeItem("access_token");
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const response = await api.post("/login", { email, password });
    localStorage.setItem("access_token", response.data.access_token);
    setUser(response.data.user);
    return response.data;
  };

  const register = async (username, email, password) => {
    const response = await api.post("/users", { username, email, password });
    return response.data;
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    setUser(null);
  };

  const updateUser = (updates) => {
    setUser((currentUser) =>
      currentUser ? { ...currentUser, ...updates } : currentUser
    );
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
