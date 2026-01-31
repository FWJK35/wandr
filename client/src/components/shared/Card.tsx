import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export default function Card({ children, className = '', onClick, hoverable = false }: CardProps) {
  return (
    <div
      className={`bg-dark-100 rounded-xl p-4 border border-white/5 ${
        hoverable ? 'hover:border-white/10 cursor-pointer transition-colors' : ''
      } ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function CardHeader({ title, subtitle, icon, action }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-3">
      <div className="flex items-center gap-3">
        {icon && <div className="text-2xl">{icon}</div>}
        <div>
          <h3 className="font-semibold text-white">{title}</h3>
          {subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
