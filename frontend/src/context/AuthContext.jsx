import { createContext, useContext, useState, useEffect } from "react";
import api from "../api/client";
import {
  SESSION_EXPIRED_EVENT,
  clearSession,
  getAccessToken,
  storeSession,
} from "../api/session";
import { forgetPushDevice } from "../utils/push";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      api
        .get("/me")
        .then((response) => setUser(response.data.user))
        .catch(() => {
          clearSession();
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // La sesión ya no se pudo renovar: se cierra también en la pantalla.
  useEffect(() => {
    const handleSessionExpired = () => {
      forgetPushDevice(null);
      setUser(null);
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () =>
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  const login = async (email, password) => {
    const response = await api.post("/login", { email, password });
    storeSession(response.data);
    setUser(response.data.user);
    return response.data;
  };

  const register = async (username, email, password, acceptedTerms) => {
    const response = await api.post("/users", {
      username,
      email,
      password,
      accepted_terms: acceptedTerms === true
    });
    return response.data;
  };

  const logout = () => {
    // Este dispositivo deja de recibir los avisos de la cuenta que se va.
    forgetPushDevice(getAccessToken());
    clearSession();
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
