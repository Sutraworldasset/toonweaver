import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUsers, updateUserRole } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../components/ui/table';
import { Users, Search, Shield, UserCog, User } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const roleConfig = {
    admin: { label: 'Admin', icon: Shield, color: 'text-red-400' },
    production_manager: { label: 'Production Manager', icon: UserCog, color: 'text-purple-400' },
    supervisor: { label: 'Supervisor', icon: UserCog, color: 'text-amber-400' },
    animator: { label: 'Animator', icon: User, color: 'text-blue-400' },
};

export default function UsersPage() {
    const { isAdmin, isProductionManager } = useAuth();
    const canManageRoles = isAdmin || isProductionManager;
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            const { data } = await getUsers();
            setUsers(data);
        } catch (error) {
            toast.error('Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    const handleRoleChange = async (userId, role) => {
        try {
            await updateUserRole(userId, role);
            toast.success('Role updated');
            loadUsers();
        } catch (error) {
            toast.error('Failed to update role');
        }
    };

    const filteredUsers = users.filter((user) =>
        user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const roleStats = {
        admin: users.filter(u => u.role === 'admin').length,
        production_manager: users.filter(u => u.role === 'production_manager').length,
        supervisor: users.filter(u => u.role === 'supervisor').length,
        animator: users.filter(u => u.role === 'animator').length,
    };

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
            <div>
                <h1 className="text-3xl font-bold text-zinc-50 font-['Chivo']">Users</h1>
                <p className="text-zinc-400 mt-1">Manage team members and their roles</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.entries(roleConfig).map(([role, config]) => (
                    <Card key={role} className="bg-zinc-900 border-zinc-800">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                        {config.label}s
                                    </p>
                                    <p className="text-2xl font-bold text-zinc-50 mt-1">{roleStats[role]}</p>
                                </div>
                                <div className={`w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center ${config.color}`}>
                                    <config.icon className="w-5 h-5" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-zinc-900 border-zinc-800 text-zinc-100"
                    data-testid="search-users-input"
                />
            </div>

            {/* Users Table */}
            <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-0">
                    {filteredUsers.length === 0 ? (
                        <div className="py-16 text-center">
                            <Users className="w-12 h-12 mx-auto mb-4 text-zinc-600" />
                            <p className="text-zinc-400">No users found</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="border-zinc-800 hover:bg-transparent">
                                    <TableHead className="text-zinc-400">Name</TableHead>
                                    <TableHead className="text-zinc-400">Email</TableHead>
                                    <TableHead className="text-zinc-400">Role</TableHead>
                                    <TableHead className="text-zinc-400">Joined</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredUsers.map((user) => {
                                    const config = roleConfig[user.role] || roleConfig.animator;
                                    return (
                                        <TableRow key={user.id} className="border-zinc-800" data-testid={`user-row-${user.id}`}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-medium text-zinc-300">
                                                        {user.name?.charAt(0).toUpperCase() || '?'}
                                                    </div>
                                                    <span className="font-medium text-zinc-100">{user.name}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-zinc-400">{user.email}</TableCell>
                                            <TableCell>
                                                {canManageRoles ? (
                                                    <Select
                                                        value={user.role}
                                                        onValueChange={(value) => handleRoleChange(user.id, value)}
                                                    >
                                                        <SelectTrigger className="w-44 bg-zinc-800 border-zinc-700" data-testid={`role-select-${user.id}`}>
                                                            <div className="flex items-center gap-2">
                                                                <config.icon className={`w-4 h-4 ${config.color}`} />
                                                                <SelectValue />
                                                            </div>
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-zinc-900 border-zinc-800">
                                                            <SelectItem value="admin">Admin</SelectItem>
                                                            <SelectItem value="production_manager">Production Manager</SelectItem>
                                                            <SelectItem value="supervisor">Supervisor</SelectItem>
                                                            <SelectItem value="animator">Animator</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <config.icon className={`w-4 h-4 ${config.color}`} />
                                                        <span className="capitalize text-zinc-300">{user.role}</span>
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-zinc-500">
                                                {format(new Date(user.created_at), 'MMM d, yyyy')}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
