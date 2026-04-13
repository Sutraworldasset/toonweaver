import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const AuthContext = createContext(null);

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

function formatApiErrorDetail(detail) {
    if (detail == null) return "Something went wrong. Please try again.";
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail))
        return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
    if (detail && typeof detail.msg === "string") return detail.msg;
    return String(detail);
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null); // null = checking, false = not auth, object = auth
    const [loading, setLoading] = useState(true);

    const checkAuth = useCallback(async () => {
        try {
            const { data } = await axios.get(`${API}/auth/me`, { withCredentials: true });
            setUser(data);
        } catch {
            setUser(false);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    const login = async (email, password) => {
        try {
            const { data } = await axios.post(
                `${API}/auth/login`,
                { email, password },
                { withCredentials: true }
            );
            setUser(data);
            return { success: true };
        } catch (e) {
            return { success: false, error: formatApiErrorDetail(e.response?.data?.detail) || e.message };
        }
    };

    const register = async (email, password, name, role = 'animator') => {
        try {
            const { data } = await axios.post(
                `${API}/auth/register`,
                { email, password, name, role },
                { withCredentials: true }
            );
            setUser(data);
            return { success: true };
        } catch (e) {
            return { success: false, error: formatApiErrorDetail(e.response?.data?.detail) || e.message };
        }
    };

    const logout = async () => {
        try {
            await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
        } catch {
            // Ignore logout errors
        } finally {
            setUser(false);
        }
    };

    const value = {
        user,
        loading,
        login,
        register,
        logout,
        checkAuth,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
        isProductionManager: user?.role === 'production_manager',
        isSupervisor: user?.role === 'supervisor',
        isAnimator: user?.role === 'animator',
        canManageProjects: ['admin', 'production_manager'].includes(user?.role),
        canManageShots: ['admin', 'production_manager', 'supervisor'].includes(user?.role),
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
