const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTime(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes} ${ampm}`;
}

/**
 * Format email date strings into human-readable relative time
 * @param dateString - Date string from email header (e.g., "Fri, Oct 17, 2025 06:19:08 -0500")
 * @returns Formatted date string (e.g., "Today at 3:12 PM", "Oct 17 at 6:19 AM")
 */
export function formatEmailDate(dateString: string): string {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 0) {
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return `Today at ${formatTime(date)}`;

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date.toDateString() === tomorrow.toDateString()) {
      return `Tomorrow at ${formatTime(date)}`;
    }

    const sameYear = now.getFullYear() === date.getFullYear();
    if (sameYear) {
      return `${MONTHS[date.getMonth()]} ${date.getDate()} at ${formatTime(date)}`;
    }

    return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }

  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;

  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return `Today at ${formatTime(date)}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${formatTime(date)}`;
  }

  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 7) {
    return `${DAYS[date.getDay()]} at ${formatTime(date)}`;
  }

  const sameYear = now.getFullYear() === date.getFullYear();
  if (sameYear) {
    return `${MONTHS[date.getMonth()]} ${date.getDate()} at ${formatTime(date)}`;
  }

  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}
