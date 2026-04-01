export type ExpoPushTicket = {
  to: string;
  title: string;
  body: string;
  sound?: "default" | null;
  priority?: "default" | "high";
  channelId?: string;
};

/** https://docs.expo.dev/push-notifications/sending-notifications/ */
export async function sendExpoPushTickets(
  tickets: ExpoPushTicket[]
): Promise<void> {
  if (tickets.length === 0) return;
  const batchSize = 99;
  for (let i = 0; i < tickets.length; i += batchSize) {
    const batch = tickets.slice(i, i + batchSize);
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Expo push HTTP ${res.status}: ${text}`);
    }
    const json = (await res.json()) as {
      data?: { status?: string; message?: string }[];
    };
    const errors = (json.data ?? []).filter((d) => d.status === "error");
    if (errors.length > 0) {
      console.error("Expo push ticket errors:", errors);
    }
  }
}
