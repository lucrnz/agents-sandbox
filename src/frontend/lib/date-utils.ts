import type { Conversation } from "@/shared/commands";

export type GroupedConversations = {
  today: Conversation[];
  yesterday: Conversation[];
  lastSevenDays: Conversation[];
  lastThirtyDays: Conversation[];
  // Groups for older content: "This Year", "2025", "2024", etc.
  // We use an array of objects to maintain order easily
  olderGroups: { title: string; conversations: Conversation[] }[];
};

export function groupConversations(conversations: Conversation[]): GroupedConversations {
  const groups: GroupedConversations = {
    today: [],
    yesterday: [],
    lastSevenDays: [],
    lastThirtyDays: [],
    olderGroups: [],
  };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const currentYear = now.getFullYear();

  // Sort by updatedAt desc
  const sorted = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  const olderByYear: Record<string, Conversation[]> = {};

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
      // > 30 days
      const year = date.getFullYear();
      const title = year === currentYear ? "This Year" : year.toString();

      if (!olderByYear[title]) {
        olderByYear[title] = [];
      }
      olderByYear[title]!.push(conv);
    }
  });

  // Convert olderByYear map to sorted array
  // Priority: "This Year", then descending years
  const sortedYears = Object.keys(olderByYear).sort((a, b) => {
    if (a === "This Year") return -1;
    if (b === "This Year") return 1;
    return parseInt(b) - parseInt(a); // Descending year
  });

  groups.olderGroups = sortedYears.map((title) => ({
    title,
    conversations: olderByYear[title]!,
  }));

  return groups;
}
