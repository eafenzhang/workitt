import { getAvatarChar } from '../utils/avatar';

interface AvatarProps {
  nickname: string;
  color: string;
  size?: number;
  onClick?: () => void;
}

/**
 * Reusable avatar component.
 * Renders a coloured circle with the nickname's initial character.
 */
export default function Avatar({ nickname, color, size = 32, onClick }: AvatarProps) {
  const char = getAvatarChar(nickname);

  return (
    <div
      onClick={onClick}
      className="rounded-full flex items-center justify-center font-bold text-white cursor-pointer select-none flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: size * 0.45,
      }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
      aria-label={nickname || '用户头像'}
      title={nickname}
    >
      {char}
    </div>
  );
}
