import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getProject, updateProject } from '../lib/api';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '../components/ui/dialog';
import {
    ArrowLeft,
    Upload,
    Eye,
    EyeOff,
    FileSpreadsheet,
    Users,
    Trash2,
    Search,
} from 'lucide-react';
import { toast } from 'sonner';

const ROLES = [
    { value: 'production_manager', label: 'Production Manager' },
    { value: 'supervisor', label: 'Supervisor' },
    { value: 'artist', label: 'Artist' },
];

export default function SheetViewPage() {
    const { projectId } = useParams();
    const { isClient, user } = useAuth();
    const navigate = useNavigate();

    const [project, setProject] = useState(null);
    const [sheets, setSheets] = useState([]); // [{name, data, visibleTo: []}]
    const [activeSheet, setActiveSheet] = useState(0);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [visibilityDialogOpen, setVisibilityDialogOpen] = useState(false);
    const [selectedSheetIndex, setSelectedSheetIndex] = useState(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        loadProject();
    }, [projectId]);

    const loadProject = async () => {
        try {
            const { data } = await getProject(projectId);
            setProject(data);
            if (data.sheets) {
                // Filter sheets based on user role
                const visibleSheets = isClient
                    ? data.sheets
                    : data.sheets.filter(s =>
                        !s.visibleTo || s.visibleTo.length === 0 || s.visibleTo.includes(user?.role)
                    );
                setSheets(visibleSheets);
            }
        } catch {
            toast.error('Failed to load project');
            navigate(`/projects/${projectId}`);
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const validTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv',
        ];
        if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
            toast.error('Please upload an Excel (.xlsx, .xls) or CSV file');
            return;
        }

        setUploading(true);
        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });

            const parsedSheets = workbook.SheetNames.map(sheetName => {
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                    header: 1,
                    defval: '',
                    raw: false,
                });
                return {
                    name: sheetName,
                    data: jsonData,
                    visibleTo: [], // empty = visible to no one except client by default
                    uploadedAt: new Date().toISOString(),
                    uploadedBy: user?.name,
                };
            });

            // Merge with existing sheets
            const existingSheets = project?.sheets || [];
            const mergedSheets = [...existingSheets, ...parsedSheets];

            await updateProject(projectId, { sheets: mergedSheets });
            setSheets(mergedSheets);
            setProject(prev => ({ ...prev, sheets: mergedSheets }));
            toast.success(`Imported ${parsedSheets.length} sheet(s) from ${file.name}`);
            setActiveSheet(mergedSheets.length - parsedSheets.length);
        } catch (err) {
            toast.error('Failed to parse file. Please check the format.');
            console.error(err);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDeleteSheet = async (index) => {
        if (!window.confirm('Delete this sheet?')) return;
        const allSheets = project?.sheets || [];
        const updated = allSheets.filter((_, i) => i !== index);
        try {
            await updateProject(projectId, { sheets: updated });
            setSheets(isClient ? updated : updated.filter(s =>
                !s.visibleTo || s.visibleTo.length === 0 || s.visibleTo.includes(user?.role)
            ));
            setProject(prev => ({ ...prev, sheets: updated }));
            setActiveSheet(0);
            toast.success('Sheet deleted');
        } catch {
            toast.error('Failed to delete sheet');
        }
    };

    const handleVisibilityChange = async (role) => {
        const allSheets = [...(project?.sheets || [])];
        const sheetIndex = allSheets.findIndex(s => s.name === sheets[selectedSheetIndex]?.name);
        if (sheetIndex === -1) return;

        const current = allSheets[sheetIndex].visibleTo || [];
        const updated = current.includes(role)
            ? current.filter(r => r !== role)
            : [...current, role];

        allSheets[sheetIndex].visibleTo = updated;

        try {
            await updateProject(projectId, { sheets: allSheets });
            setProject(prev => ({ ...prev, sheets: allSheets }));
            setSheets(allSheets);
            toast.success('Visibility updated');
        } catch {
            toast.error('Failed to update visibility');
        }
    };

    const currentSheet = sheets[activeSheet];

    // Filter rows by search
    const filteredData = currentSheet?.data?.filter((row, idx) => {
        if (idx === 0) return true; // always show header
        if (!searchQuery) return true;
        return row.some(cell => String(cell).toLowerCase().includes(searchQuery.toLowerCase()));
    }) || [];

    const headers = filteredData[0] || [];
    const rows = filteredData.slice(1);

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
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate(`/projects/${projectId}`)} className="text-zinc-400 hover:text-zinc-100">
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <div className="flex-1">
                    <h1 className="text-3xl font-bold text-zinc-50 font-['Chivo']">
                        {project?.name} — Sheets
                    </h1>
                    <p className="text-zinc-400 mt-1">Import and manage spreadsheet data</p>
                </div>
                {isClient && (
                    <>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={handleFileUpload}
                            className="hidden"
                        />
                        <Button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="bg-blue-600 hover:bg-blue-500"
                        >
                            <Upload className="w-4 h-4 mr-2" />
                            {uploading ? 'Importing...' : 'Import Excel / CSV'}
                        </Button>
                    </>
                )}
            </div>

            {sheets.length === 0 ? (
                <Card className="bg-zinc-900 border-zinc-800">
                    <CardContent className="py-24 text-center">
                        <FileSpreadsheet className="w-16 h-16 mx-auto mb-4 text-zinc-600" />
                        <h3 className="text-lg font-medium text-zinc-300 mb-2">No sheets imported yet</h3>
                        {isClient ? (
                            <div className="space-y-3">
                                <p className="text-zinc-500">Import an Excel or CSV file to get started</p>
                                <Button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="bg-blue-600 hover:bg-blue-500 mx-auto"
                                >
                                    <Upload className="w-4 h-4 mr-2" />
                                    Import Excel / CSV
                                </Button>
                            </div>
                        ) : (
                            <p className="text-zinc-500">No sheets have been shared with you yet</p>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <div className="flex gap-4">
                    {/* Sheet Tabs Sidebar */}
                    <div className="w-52 flex-shrink-0 space-y-1">
                        {sheets.map((sheet, index) => (
                            <div
                                key={index}
                                onClick={() => setActiveSheet(index)}
                                className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors group ${
                                    activeSheet === index
                                        ? 'bg-blue-600/20 border border-blue-500/40 text-blue-400'
                                        : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-800'
                                }`}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <FileSpreadsheet className="w-4 h-4 flex-shrink-0" />
                                    <span className="text-sm font-medium truncate">{sheet.name}</span>
                                </div>
                                {isClient && (
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedSheetIndex(index);
                                                setVisibilityDialogOpen(true);
                                            }}
                                            className="text-zinc-400 hover:text-blue-400 p-0.5"
                                            title="Manage visibility"
                                        >
                                            <Eye className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteSheet(index);
                                            }}
                                            className="text-zinc-400 hover:text-red-400 p-0.5"
                                            title="Delete sheet"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Visibility legend for current sheet */}
                        {isClient && currentSheet && (
                            <div className="mt-4 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                                <p className="text-xs text-zinc-500 mb-2 font-medium">Visible to:</p>
                                {currentSheet.visibleTo?.length === 0 ? (
                                    <p className="text-xs text-zinc-600 italic">Client only</p>
                                ) : (
                                    <div className="space-y-1">
                                        {currentSheet.visibleTo.map(role => (
                                            <span key={role} className="block text-xs text-emerald-400 capitalize">
                                                ✓ {role.replace('_', ' ')}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <button
                                    onClick={() => {
                                        setSelectedSheetIndex(activeSheet);
                                        setVisibilityDialogOpen(true);
                                    }}
                                    className="mt-2 text-xs text-blue-400 hover:text-blue-300"
                                >
                                    Edit visibility →
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Sheet Content */}
                    <div className="flex-1 min-w-0 space-y-4">
                        {/* Toolbar */}
                        <div className="flex items-center gap-3">
                            <div className="relative flex-1 max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                <Input
                                    placeholder="Search in sheet..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 bg-zinc-900 border-zinc-800 text-zinc-100"
                                />
                            </div>
                            <span className="text-xs text-zinc-500">
                                {rows.length} rows × {headers.length} cols
                            </span>
                        </div>

                        {/* Table */}
                        <Card className="bg-zinc-900 border-zinc-800">
                            <CardContent className="p-0 overflow-auto max-h-[65vh]">
                                {headers.length === 0 ? (
                                    <div className="py-16 text-center text-zinc-500">
                                        <p>This sheet appears to be empty</p>
                                    </div>
                                ) : (
                                    <table className="w-full text-sm border-collapse">
                                        <thead className="sticky top-0 bg-zinc-800 z-10">
                                            <tr>
                                                <th className="px-3 py-2 text-left text-xs text-zinc-500 border-b border-r border-zinc-700 w-10">#</th>
                                                {headers.map((header, i) => (
                                                    <th key={i} className="px-3 py-2 text-left text-xs font-semibold text-zinc-300 border-b border-r border-zinc-700 whitespace-nowrap min-w-24">
                                                        {String(header) || `Col ${i + 1}`}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((row, rowIdx) => (
                                                <tr key={rowIdx} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800">
                                                    <td className="px-3 py-2 text-xs text-zinc-600 border-r border-zinc-800">{rowIdx + 1}</td>
                                                    {headers.map((_, colIdx) => (
                                                        <td key={colIdx} className="px-3 py-2 text-zinc-300 text-xs border-r border-zinc-800 whitespace-nowrap max-w-48 truncate">
                                                            {String(row[colIdx] ?? '')}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}

            {/* Visibility Dialog */}
            <Dialog open={visibilityDialogOpen} onOpenChange={setVisibilityDialogOpen}>
                <DialogContent className="bg-zinc-900 border-zinc-800">
                    <DialogHeader>
                        <DialogTitle className="text-zinc-100 flex items-center gap-2">
                            <Users className="w-5 h-5" />
                            Manage Visibility — "{sheets[selectedSheetIndex]?.name}"
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                        <p className="text-sm text-zinc-400">Choose which roles can see this sheet. Client always has access.</p>
                        <div className="space-y-3">
                            {ROLES.map((role) => {
                                const isVisible = sheets[selectedSheetIndex]?.visibleTo?.includes(role.value);
                                return (
                                    <div
                                        key={role.value}
                                        onClick={() => handleVisibilityChange(role.value)}
                                        className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-all ${
                                            isVisible
                                                ? 'border-emerald-500/50 bg-emerald-500/10'
                                                : 'border-zinc-700 bg-zinc-800/30 hover:border-zinc-600'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            {isVisible
                                                ? <Eye className="w-5 h-5 text-emerald-400" />
                                                : <EyeOff className="w-5 h-5 text-zinc-500" />
                                            }
                                            <span className={`font-medium ${isVisible ? 'text-emerald-300' : 'text-zinc-400'}`}>
                                                {role.label}
                                            </span>
                                        </div>
                                        <span className={`text-xs px-2 py-1 rounded ${isVisible ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700 text-zinc-500'}`}>
                                            {isVisible ? 'Visible' : 'Hidden'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        <Button onClick={() => setVisibilityDialogOpen(false)} className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
                            Done
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
