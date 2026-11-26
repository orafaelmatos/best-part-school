import { forwardRef, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";

import { APP_PATHS } from "@/lib/routes";
import { studentInitials } from "./useStudentProfile";

type Props = {
  /** Home shows the school brand; other screens show their name. */
  variant: "brand" | "title";
  title: string;
  onBack?: () => void;
  actions?: ReactNode;
  name?: string;
  photo?: string | null;
};

/** Sticky screen header: brand or screen name, optional back button, actions and the student avatar. */
const ScreenHeader = forwardRef<HTMLElement, Props>(({ variant, title, onBack, actions, name, photo }, ref) => (
  <header ref={ref} className="student-header">
    <div className="student-header-inner">
      {variant === "brand" ? (
        <Link to={APP_PATHS.dashboard} aria-label="Best Part School, início" className="flex min-h-11 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <img src="/img/bps-logo-192.png" alt="" className="size-10 rounded-md border border-line bg-surface object-contain p-1" />
          <span className="text-body-lg font-semibold text-ink">Best Part School</span>
        </Link>
      ) : (
        <div className="flex min-w-0 items-center gap-2">
          {onBack && (
            <button type="button" onClick={onBack} aria-label="Voltar" className="student-icon-button -ml-2 border-transparent bg-transparent">
              <ChevronLeft size={24} aria-hidden="true" />
            </button>
          )}
          <span className="truncate text-h4 text-ink">{title}</span>
        </div>
      )}
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        <Link to={APP_PATHS.profile} className="student-avatar" aria-label="Abrir meu perfil">
          {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : studentInitials(name)}
        </Link>
      </div>
    </div>
  </header>
));
ScreenHeader.displayName = "ScreenHeader";

export default ScreenHeader;
