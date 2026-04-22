import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUsers, createUser, updateUserRole, deleteUser } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '../components/ui/dialog';
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
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '../components/ui/alert-dialog';
import { Users, Search, Shield, UserCog, User, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const roleConfig = {
    client:             { label: 'Client',              icon: Shield,  color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    production_manager: { label: 'Production Manager',  icon: UserCog, color: 'text-purple-400',  bg: 'bg-purple-500/10'  },
    supervisor:         { label: 'Supervisor',           icon: UserCog, color: 'text-amber-400',   bg: 'bg-amber-500/10'   },
    artist:             { label: 'Artist',               icon: User,    color: 'text-blue-400',    bg: 'bg-blue-500/10'    },
};

// Which roles each role can create OR assign
const assignableRoles = {
    client:             ['production_manager', 'supervisor', 'artist'],
    production_manager: ['supervisor', 'artist'],
    supervisor:         ['artist'],
    artist:             [],
};

export default function UsersPage() {
    const { user: currentUser, isClient, isProductionManager, isSupervisor } = useAuth();
    const canManageRoles = isClient || isProductionManager;
    const canCreateUsers = isClient || isProductionManager || isSupervisor;

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: '',
    });

    const allowedRoles = assignableRoles[currentUser?.role] || [];

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            const { data } = await getUsers();
            setUsers(Array.isArray(data) ? data : []);
        } catch {
            toast.error('Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) { toast.error('Please enter a name'); return; }
        if (!formData.email.trim()) { toast.error('Please enter an email'); return; }
        if (!formData.password || formData.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
        if (!formData.role) { toast.error('Please select a role'); return; }

        setCreating(true);
        try {
            await createUser(formData);
            toast.success(`${roleConfig[formData.role]?.label} account created for ${formData.name}`);
            setCreateOpen(false);
            setFormData({ name: '', email: '', password: '', role: '' });
            setShowPassword(false);
            loadUsers();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to create user');
        } finally {
            setCreating(false);
        }
    };

    const handleRoleChange = async (userId, newRole) => {
        // Frontend guard — prevent assigning roles outside allowed list
        if (!allowedRoles.includes(newRole) && !isClient) {
            toast.error(`You cannot assign the ${roleConfig[newRole]?.label} role`);
            return;
        }
        try {
            await updateUserRole(userId, newRole);
            toast.success('Role updated');
            loadUsers();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to update role');
        }
    };

    const handleDeleteUser = async (userId, userName) => {
        try {
            await deleteUser(userId);
            toast.success(`${userName} has been removed`);
            loadUsers();
        } catch {
            toast.error('Failed to delete user');
        }
    };

    const filteredUsers = users.filter((u) =>
        u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.role?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const roleStats = {
        client:             users.filter(u => u.role === 'client').length,
        production_manager: users.filter(u => u.role === 'production_manager').length,
        supervisor:         users.filter(u => u.role === 'supervisor').length,
        artist:             users.filter(u => u.role === 'artist').length,
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
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-zinc-50 font-['Chivo']">Users</h1>
                    <p className="text-zinc-400 mt-1">Manage team members and their roles</p>
                </div>
                {canCreateUsers && allowedRoles.length > 0 && (
                    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                        <DialogTrigger asChild>
                            <Button className="bg-blue-600 hover:bg-blue-500 text-white">
                                <Plus className="w-4 h-4 mr-2" />
                                Add User
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-zinc-900 border-zinc-800">
                            <DialogHeader>
                                <DialogTitle className="text-zinc-100">Create New User</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleCreateUser} className="space-y-4 mt-4">
                                <div className="space-y-2">
                                    <Label className="text-zinc-300">Role *</Label>
                                    <div className="grid grid-cols-1 gap-2">
                                        {allowedRoles.map((role) => {
                                            const config = roleConfig[role];
                                            return (
                                                <button
                                                    key={role}
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, role })}
                                                    className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                                                        formData.role === role
                                                            ? 'border-blue-500 bg-blue-500/10'
                                                            : 'border-zinc-700 bg-zinc-800/30 hover:border-zinc-600'
                                                    }`}
                                                >
                                                    <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center`}>
                                                        <config.icon className={`w-4 h-4 ${config.color}`} />
                                                    </div>
                                                    <span className={`text-sm font-medium ${formData.role === role ? 'text-blue-300' : 'text-zinc-300'}`}>
                                                        {config.label}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-zinc-300">Full Name *</Label>
                                    <Input
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g. John Smith"
                                        className="bg-zinc-950 border-zinc-800 text-zinc-100"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-zinc-300">Email *</Label>
                                    <Input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="user@example.com"
                                        className="bg-zinc-950 border-zinc-800 text-zinc-100"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-zinc-300">Password *</Label>
                                    <div className="relative">
                                        <Input
                                            type={showPassword ? 'text' : 'password'}
                                            value={formData.password}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            placeholder="Min. 6 characters"
                                            className="bg-zinc-950 border-zinc-800 text-zinc-100 pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <p className="text-xs text-zinc-500">Share this password with the user so they can log in.</p>
                                </div>

                                <div className="flex justify-end gap-3 pt-2">
                                    <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)} className="text-zinc-400">
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={creating || !formData.role} className="bg-blue-600 hover:bg-blue-500">
                                        {creating ? 'Creating...' : `Create ${roleConfig[formData.role]?.label || 'User'}`}
                                    </Button>
                                </div>
                            </form>
                        </DialogContent>
                    </Dialog>
                )}
            </div>

            {/* Role Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                                <div className={`w-10 h-10 rounded-lg ${config.bg} flex items-center justify-center`}>
                                    <config.icon className={`w-5 h-5 ${config.color}`} />
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
                    placeholder="Search by name, email or role..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-zinc-900 border-zinc-800 text-zinc-100"
                />
            </div>

            {/* Users Table */}
            <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-0">
                    {filteredUsers.length === 0 ? (
                        <div className="py-16 text-center">
                            <Users className="w-12 h-12 mx-auto mb-4 text-zinc-600" />
                            <p className="text-zinc-400">No users found</p>
                            {canCreateUsers && (
                                <p className="text-zinc-500 text-sm mt-2">Click "Add User" to create your first team member</p>
                            )}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="border-zinc-800 hover:bg-transparent">
                                    <TableHead className="text-zinc-400">Name</TableHead>
                                    <TableHead className="text-zinc-400">Email</TableHead>
                                    <TableHead className="text-zinc-400">Role</TableHead>
                                    <TableHead className="text-zinc-400">Joined</TableHead>
                                    {isClient && <TableHead className="text-zinc-400 text-right">Actions</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredUsers.map((u) => {
                                    const config = roleConfig[u.role] || roleConfig.artist;
                                    const isCurrentUser = u.id === currentUser?.id;
                                    // Can this logged-in user change this user's role?
                                    const canChangeThisRole = canManageRoles && !isCurrentUser && allowedRoles.includes(u.role);

                                    return (
                                        <TableRow key={u.id} className="border-zinc-800">
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-9 h-9 rounded-full ${config.bg} flex items-center justify-center text-sm font-medium ${config.color}`}>
                                                        {u.name?.charAt(0).toUpperCase() || '?'}
                                                    </div>
                                                    <div>
                                                        <span className="font-medium text-zinc-100">{u.name}</span>
                                                        {isCurrentUser && (
                                                            <span className="ml-2 text-xs text-zinc-500">(you)</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-zinc-400">{u.email}</TableCell>
                                            <TableCell>
                                                {canChangeThisRole ? (
                                                    <Select
                                                        value={u.role}
                                                        onValueChange={(value) => handleRoleChange(u.id, value)}
                                                    >
                                                        <SelectTrigger className="w-48 bg-zinc-800 border-zinc-700">
                                                            <div className="flex items-center gap-2">
                                                                <config.icon className={`w-4 h-4 ${config.color}`} />
                                                                <SelectValue />
                                                            </div>
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-zinc-900 border-zinc-800">
                                                            {/* Only show roles this user is allowed to assign */}
                                                            {allowedRoles.map((role) => (
                                                                <SelectItem key={role} value={role}>
                                                                    {roleConfig[role]?.label}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                ) : (
                                                    <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-lg ${config.bg}`}>
                                                        <config.icon className={`w-3 h-3 ${config.color}`} />
                                                        <span className={`text-xs font-medium ${config.color}`}>
                                                            {config.label}
                                                        </span>
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-zinc-500 text-sm">
                                                {u.created_at ? format(new Date(u.created_at), 'MMM d, yyyy') : '-'}
                                            </TableCell>
                                            {isClient && (
                                                <TableCell className="text-right">
                                                    {!isCurrentUser && (
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <Button variant="ghost" size="icon"
                                                                    className="text-zinc-500 hover:text-red-400 hover:bg-red-500/10">
                                                                    <Trash2 className="w-4 h-4" />
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent className="bg-zinc-900 border-zinc-800">
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle className="text-zinc-100">Remove {u.name}?</AlertDialogTitle>
                                                                    <AlertDialogDescription className="text-zinc-400">
                                                                        This will permanently delete {u.name}'s account ({u.email}). They will no longer be able to log in. This cannot be undone.
                                                                    </AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel className="bg-zinc-800 text-zinc-300 border-zinc-700">Cancel</AlertDialogCancel>
                                                                    <AlertDialogAction onClick={() => handleDeleteUser(u.id, u.name)} className="bg-red-600 hover:bg-red-500">
                                                                        Delete User
                                                                    </AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    )}
                                                </TableCell>
                                            )}
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
