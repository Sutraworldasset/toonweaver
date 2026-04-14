import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getNotifications } from '../lib/api';
import { Button } from './ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
    Film,
    LayoutDashboard,
    FolderKanban,
    Users,
    Bell,
    LogOut,
    ChevronRight,
    Menu,
    X,
} from 'lucide-react';

const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/projects', label: 'Projects', icon: FolderKanban },
];

const adminNavItems = [
    { path: '/users', label: 'Users', icon: Users },
];

export default function DashboardLayout() {
    const { user, logout, isClient, isProductionManager, isSupervisor } = useAuth();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        loadNotifications();
        const interval = setInterval(loadNotifications, 30000);
        return () => clearInterval(interval);
    }, []);

    const loadNotifications = async () => {
        try {
            const { data } = await getNotifications();
            setNotifications(data);
            setUnreadCount(data.filter((n) => !n.read).length);
        } catch {
            // Ignore notification errors
        }
    };

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    const allNavItems = isClient || isProductionManager || isSupervisor
        ? [...navItems, ...adminNavItems]
        : navItems;

    return (
        <div className="dashboard-layout">
            {/* Mobile sidebar backdrop */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`dashboard-sidebar fixed lg:static inset-y-0 left-0 z-50 transform ${
                    sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                } lg:translate-x-0 transition-transform duration-200`}
            >
                {/* Logo */}
                <div className="h-14 flex items-center justify-between px-4 border-b border-zinc-800">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                            <Film className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-bold text-zinc-50 font-['Chivo']">Toonweaver</span>
                    </div>
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="lg:hidden text-zinc-400 hover:text-zinc-100"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4 space-y-1">
                    {allNavItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={() => setSidebarOpen(false)}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                    isActive
                                        ? 'bg-zinc-800 text-zinc-50'
                                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
                                }`
                            }
                            data-testid={`nav-${item.label.toLowerCase()}`}
                        >
                            <item.icon className="w-5 h-5" />
                            {item.label}
                        </NavLink>
                    ))}
                </nav>

                {/* User */}
                <div className="p-4 border-t border-zinc-800">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-medium text-zinc-300">
                            {user?.name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-100 truncate">{user?.name}</p>
                            <p className="text-xs text-zinc-500 capitalize">{user?.role}</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main content */}
            <div className="dashboard-main">
                {/* Header */}
                <header className="dashboard-header">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="lg:hidden text-zinc-400 hover:text-zinc-100"
                            data-testid="mobile-menu-button"
                        >
                            <Menu className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Notifications */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="relative text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                                    data-testid="notifications-button"
                                >
                                    <Bell className="w-5 h-5" />
                                    {unreadCount > 0 && (
                                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 rounded-full text-xs font-medium flex items-center justify-center text-white">
                                            {unreadCount > 9 ? '9+' : unreadCount}
                                        </span>
                                    )}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-80 bg-zinc-900 border-zinc-800">
                                <div className="px-3 py-2 border-b border-zinc-800">
                                    <h3 className="font-medium text-zinc-100">Notifications</h3>
                                </div>
                                <div className="max-h-80 overflow-y-auto">
                                    {notifications.length === 0 ? (
                                        <div className="px-3 py-6 text-center text-zinc-500 text-sm">
                                            No notifications
                                        </div>
                                    ) : (
                                        notifications.slice(0, 5).map((notif) => (
                                            <DropdownMenuItem
                                                key={notif.id}
                                                className={`flex flex-col items-start gap-1 px-3 py-2 cursor-pointer ${
                                                    !notif.read ? 'bg-zinc-800/50' : ''
                                                }`}
                                                onClick={() => notif.link && navigate(notif.link)}
                                            >
                                                <span className="text-sm font-medium text-zinc-100">{notif.title}</span>
                                                <span className="text-xs text-zinc-400">{notif.message}</span>
                                            </DropdownMenuItem>
                                        ))
                                    )}
                                </div>
                                {notifications.length > 0 && (
                                    <div className="border-t border-zinc-800">
                                        <button
                                            onClick={() => navigate('/notifications')}
                                            className="w-full px-3 py-2 text-sm text-blue-400 hover:bg-zinc-800/50 flex items-center justify-center gap-1"
                                        >
                                            View all <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* User menu */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    className="flex items-center gap-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                                    data-testid="user-menu-button"
                                >
                                    <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-medium text-zinc-300">
                                        {user?.name?.charAt(0).toUpperCase() || 'U'}
                                    </div>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 bg-zinc-900 border-zinc-800">
                                <div className="px-3 py-2">
                                    <p className="text-sm font-medium text-zinc-100">{user?.name}</p>
                                    <p className="text-xs text-zinc-500">{user?.email}</p>
                                </div>
                                <DropdownMenuSeparator className="bg-zinc-800" />
                                <DropdownMenuItem
                                    onClick={handleLogout}
                                    className="text-red-400 cursor-pointer"
                                    data-testid="logout-button"
                                >
                                    <LogOut className="w-4 h-4 mr-2" />
                                    Logout
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>

                {/* Content */}
                <main className="dashboard-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
