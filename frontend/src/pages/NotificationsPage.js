import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function NotificationsPage() {
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadNotifications();
    }, []);

    const loadNotifications = async () => {
        try {
            const { data } = await getNotifications();
            setNotifications(data);
        } catch (error) {
            toast.error('Failed to load notifications');
        } finally {
            setLoading(false);
        }
    };

    const handleMarkRead = async (id) => {
        try {
            await markNotificationRead(id);
            loadNotifications();
        } catch (error) {
            toast.error('Failed to mark as read');
        }
    };

    const handleMarkAllRead = async () => {
        try {
            await markAllNotificationsRead();
            toast.success('All notifications marked as read');
            loadNotifications();
        } catch (error) {
            toast.error('Failed to mark all as read');
        }
    };

    const handleNotificationClick = async (notification) => {
        if (!notification.read) {
            await handleMarkRead(notification.id);
        }
        if (notification.link) {
            navigate(notification.link);
        }
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-zinc-50 font-['Chivo']">Notifications</h1>
                    <p className="text-zinc-400 mt-1">
                        {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up!'}
                    </p>
                </div>
                {unreadCount > 0 && (
                    <Button
                        variant="outline"
                        onClick={handleMarkAllRead}
                        className="border-zinc-700 text-zinc-300"
                        data-testid="mark-all-read-button"
                    >
                        <CheckCheck className="w-4 h-4 mr-2" />
                        Mark all as read
                    </Button>
                )}
            </div>

            {/* Notifications List */}
            <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-0">
                    {notifications.length === 0 ? (
                        <div className="py-16 text-center">
                            <Bell className="w-12 h-12 mx-auto mb-4 text-zinc-600" />
                            <p className="text-zinc-400">No notifications yet</p>
                            <p className="text-zinc-500 text-sm mt-1">
                                You'll be notified when shots are assigned or feedback is added
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-zinc-800">
                            {notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    onClick={() => handleNotificationClick(notification)}
                                    className={`flex items-start gap-4 p-4 cursor-pointer transition-colors hover:bg-zinc-800/50 ${
                                        !notification.read ? 'bg-zinc-800/30' : ''
                                    }`}
                                    data-testid={`notification-${notification.id}`}
                                >
                                    <div className={`w-2 h-2 rounded-full mt-2 ${notification.read ? 'bg-zinc-600' : 'bg-blue-500'}`} />
                                    <div className="flex-1 min-w-0">
                                        <p className={`font-medium ${notification.read ? 'text-zinc-400' : 'text-zinc-100'}`}>
                                            {notification.title}
                                        </p>
                                        <p className="text-sm text-zinc-500 mt-1">{notification.message}</p>
                                        <p className="text-xs text-zinc-600 mt-2">
                                            {format(new Date(notification.created_at), 'MMM d, yyyy • HH:mm')}
                                        </p>
                                    </div>
                                    {!notification.read && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleMarkRead(notification.id);
                                            }}
                                            className="text-zinc-500 hover:text-zinc-300"
                                            data-testid={`mark-read-${notification.id}`}
                                        >
                                            <Check className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
