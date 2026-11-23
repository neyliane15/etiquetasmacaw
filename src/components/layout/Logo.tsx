import logoRaw from '@/assets/logo.svg?raw';

/** Extrai o atributo `d` do path da silhueta (src/assets/logo.svg). */
const LOGO_PATH = /\sd="([^"]+)"/.exec(logoRaw)?.[1] ?? '';

export interface LogoProps {
  size?: number;
  className?: string;
  title?: string;
}

/** Silhueta da arara Macaw — SVG inline com `currentColor` (oliva na UI, preto na etiqueta). */
export function Logo({ size = 32, className, title }: LogoProps): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <path d={LOGO_PATH} />
    </svg>
  );
}

export default Logo;
