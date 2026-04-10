import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Film, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export default function LoginPage() {
    const { login, register } = useAuth();
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        name: '',
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (isLogin) {
                const result = await login(formData.email, formData.password);
                if (!result.success) {
                    toast.error(result.error);
                } else {
                    toast.success('Welcome back!');
                }
            } else {
                if (!formData.name.trim()) {
                    toast.error('Please enter your name');
                    setLoading(false);
                    return;
                }
                const result = await register(formData.email, formData.password, formData.name);
                if (!result.success) {
                    toast.error(result.error);
                } else {
                    toast.success('Account created successfully!');
                }
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-split">
            {/* Form Side */}
            <div className="flex items-center justify-center p-8 bg-zinc-950">
                <div className="w-full max-w-sm space-y-8">
                    {/* Logo */}
                    <div className="text-center">
                        <div className="flex items-center justify-center gap-3 mb-6">
                            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
                                <Film className="w-7 h-7 text-white" />
                            </div>
                            <h1 className="text-3xl font-bold text-zinc-50 tracking-tight font-['Chivo']">
                                Toonweaver
                            </h1>
                        </div>
                        <p className="text-zinc-400 text-sm">
                            {isLogin ? 'Sign in to your account' : 'Create your account'}
                        </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {!isLogin && (
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-zinc-300">Name</Label>
                                <Input
                                    id="name"
                                    type="text"
                                    placeholder="Your name"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-blue-500"
                                    data-testid="register-name-input"
                                />
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-zinc-300">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="you@example.com"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                className="bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-blue-500"
                                required
                                data-testid="login-email-input"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-zinc-300">Password</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-blue-500 pr-10"
                                    required
                                    data-testid="login-password-input"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium"
                            disabled={loading}
                            data-testid="login-submit-button"
                        >
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    {isLogin ? 'Signing in...' : 'Creating account...'}
                                </span>
                            ) : (
                                isLogin ? 'Sign in' : 'Create account'
                            )}
                        </Button>
                    </form>

                    {/* Toggle */}
                    <div className="text-center">
                        <button
                            type="button"
                            onClick={() => setIsLogin(!isLogin)}
                            className="text-sm text-zinc-400 hover:text-blue-400 transition-colors"
                            data-testid="toggle-auth-mode"
                        >
                            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Image Side */}
            <div className="login-image-side relative hidden lg:block">
                <img
                    src="https://static.prod-images.emergentagent.com/jobs/cdb8553e-ccf0-471d-81ed-c93aeed5709b/images/787937f3152fa446854c22ecbf0f765adce8fbdf2775a689fe595aaef5ce4bf6.png"
                    alt="3D Animation Workspace"
                    className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-zinc-950/40" />
                <div className="absolute bottom-8 left-8 right-8">
                    <p className="text-white/80 text-lg font-medium">
                        Streamline your 3D animation pipeline
                    </p>
                    <p className="text-white/60 text-sm mt-2">
                        Manage projects, shots, and team feedback all in one place
                    </p>
                </div>
            </div>
        </div>
    );
}
