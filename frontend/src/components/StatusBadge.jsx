import { cn } from '../lib/utils';

const statusConfig = {
    approved: {
        label: 'Approved',
        className: 'status-approved',
    },
    retake: {
        label: 'Retake',
        className: 'status-retake',
    },
    in_progress: {
        label: 'In Progress',
        className: 'status-in-progress',
    },
    submitted: {
        label: 'Submitted',
        className: 'status-submitted',
    },
    not_started: {
        label: 'Not Started',
        className: 'status-not-started',
    },
};

export default function StatusBadge({ status, className }) {
    const config = statusConfig[status] || statusConfig.not_started;

    return (
        <span
            className={cn(
                'inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border',
                config.className,
                className
            )}
            data-testid={`status-badge-${status}`}
        >
            <span className={cn('w-1.5 h-1.5 rounded-full mr-1.5', {
                'bg-emerald-500': status === 'approved',
                'bg-red-500': status === 'retake',
                'bg-amber-500': status === 'in_progress',
                'bg-blue-500': status === 'submitted',
                'bg-zinc-500': status === 'not_started',
            })} />
            {config.label}
        </span>
    );
}
