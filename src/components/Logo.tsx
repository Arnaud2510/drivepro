export const APP_NAME = (import.meta.env.VITE_APP_NAME as string | undefined) || 'DrivePro';

export function Logo({ light }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" />
      <span className={`text-lg font-extrabold tracking-tight ${light ? 'text-white' : 'text-brand-900'}`}>{APP_NAME}</span>
    </span>
  );
}
