import { ButtonHTMLAttributes, ReactNode } from 'react';
import LoadingSpinner from './LoadingSpinner';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseClasses = 'inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses = {
    primary: 'bg-primary-500 hover:bg-primary-600 text-white',
    secondary: 'bg-dark-100 hover:bg-dark-200 text-white border border-white/10',
    ghost: 'bg-transparent hover:bg-white/5 text-white',
    danger: 'bg-red-500 hover:bg-red-600 text-white',
  };

  const sizeClasses = {
    sm: 'text-sm px-3 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-base px-6 py-3',
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <LoadingSpinner size="sm" />
      ) : icon ? (
        <span className="text-lg">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
