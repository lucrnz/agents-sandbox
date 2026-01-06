import type { Conversation } from "@/shared/commands";

export type GroupedConversations = {
  today: Conversation[];
  yesterday: Conversation[];
  lastSevenDays: Conversation[];
  lastThirtyDays: Conversation[];
  older: Conversation[];
};

export function groupConversations(conversations: Conversation[]): GroupedConversations {
  const groups: GroupedConversations = {
    today: [],
    yesterday: [],
    lastSevenDays: [],
    lastThirtyDays: [],
    older: [],
  };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Sort by updatedAt desc
  const sorted = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  sorted.forEach((conv) => {
    const date = new Date(conv.updatedAt);
    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    // Calculate difference in days
    const diffTime = todayStart.getTime() - dateStart.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      groups.today.push(conv);
    } else if (diffDays === 1) {
      groups.yesterday.push(conv);
    } else if (diffDays > 1 && diffDays <= 7) {
      groups.lastSevenDays.push(conv);
    } else if (diffDays > 7 && diffDays <= 30) {
      groups.lastThirtyDays.push(conv);
    } else {
      groups.older.push(conv);
    }
  });

  return groups;
}
