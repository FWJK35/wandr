interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4 border',
    md: 'w-6 h-6 border-2',
    lg: 'w-10 h-10 border-2',
  };

  return (
    <div
      className={`${sizeClasses[size]} border-primary-500 border-t-transparent rounded-full animate-spin ${className}`}
    />
  );
}

export function FullPageLoader() {
  return (
    <div className="h-full flex items-center justify-center bg-dark-300">
      <div className="flex flex-col items-center gap-4">
        <LoadingSpinner size="lg" />
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    </div>
  );
}
