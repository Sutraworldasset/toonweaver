import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
const API = 'https://toonweaver-production.up.railway.app/api';
const API = `${import.meta.env.VITE_BACKEND_URL || 'https://toonweaver-production.up.railway.app'}/api`;
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
    const [user, setUser] = useState(null);
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

    // Login now requires role to be passed and verified by backend
    const login = async (email, password, role) => {
        try {
            const { data } = await axios.post(
                `${API}/auth/login`,
                { email, password, role },
                { withCredentials: true }
            );
            setUser(data);
            return { success: true };
        } catch (e) {
            return {
                success: false,
                error: formatApiErrorDetail(e.response?.data?.detail) || e.message
            };
        }
    };

    // Register — only called by authenticated users (client/PM/supervisor)
    const register = async (email, password, name, role) => {
        try {
            const { data } = await axios.post(
                `${API}/auth/register`,
                { email, password, name, role },
                { withCredentials: true }
            );
            return { success: true, data };
        } catch (e) {
            return {
                success: false,
                error: formatApiErrorDetail(e.response?.data?.detail) || e.message
            };
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
        isClient: user?.role === 'client',
        isProductionManager: user?.role === 'production_manager',
        isSupervisor: user?.role === 'supervisor',
        isArtist: user?.role === 'artist',
        canManageProjects: ['client', 'production_manager'].includes(user?.role),
        canManageEpisodes: ['client', 'production_manager'].includes(user?.role),
        canManageShots: ['client', 'production_manager'].includes(user?.role),
        canAssignShots: ['client', 'production_manager', 'supervisor'].includes(user?.role),
        canReview: ['client', 'supervisor'].includes(user?.role),
        canManageUsers: ['client', 'production_manager', 'supervisor'].includes(user?.role),
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
